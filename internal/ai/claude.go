package ai

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"

	"github.com/philipparndt/go-logger"
)

// StreamEvent represents a single event from Claude Code's stream-json output.
type StreamEvent struct {
	Type      string `json:"type"`
	Content   string `json:"content,omitempty"`
	Error     string `json:"error,omitempty"`
	Activity  string `json:"activity,omitempty"`
	SessionID string `json:"sessionId,omitempty"`
}

func formatActivity(toolName string, input map[string]any) string {
	switch toolName {
	case "Read":
		if fp, ok := input["file_path"].(string); ok {
			return "Reading " + fp
		}
		return "Reading file"
	case "Glob":
		if p, ok := input["pattern"].(string); ok {
			return "Searching " + p
		}
		return "Searching files"
	case "Grep":
		if p, ok := input["pattern"].(string); ok {
			return "Searching for " + p
		}
		return "Searching code"
	case "Edit":
		if fp, ok := input["file_path"].(string); ok {
			return "Editing " + fp
		}
		return "Editing file"
	case "Write":
		if fp, ok := input["file_path"].(string); ok {
			return "Writing " + fp
		}
		return "Writing file"
	case "Bash":
		if cmd, ok := input["command"].(string); ok {
			if len(cmd) > 60 {
				cmd = cmd[:60] + "..."
			}
			return "Running: " + cmd
		}
		return "Running command"
	case "":
		return ""
	default:
		return "Using " + toolName
	}
}

type PermissionLevel string

const (
	PermReadOnly  PermissionLevel = "read-only"
	PermEditFiles PermissionLevel = "edit-files"
	PermFull      PermissionLevel = "full"
)

// RunAnalysis spawns claude CLI with the given prompt and source directory.
// If sessionID is provided, it resumes that session instead of starting a new one.
func RunAnalysis(ctx context.Context, sourceDir, prompt, sessionID string, permLevel PermissionLevel) (<-chan StreamEvent, error) {
	args := []string{}

	if sessionID != "" {
		args = append(args, "-p", prompt, "--resume", sessionID, "--output-format", "stream-json", "--verbose")
	} else {
		args = append(args, "-p", prompt, "--output-format", "stream-json", "--verbose")
	}

	switch permLevel {
	case PermEditFiles:
		args = append(args, "--permission-mode", "acceptEdits")
	case PermFull:
		args = append(args, "--permission-mode", "bypassPermissions")
	// PermReadOnly: default mode, no extra flags
	}

	cmd := exec.CommandContext(ctx, "claude", args...)
	if sourceDir != "" {
		cmd.Dir = sourceDir
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start claude: %w", err)
	}

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			logger.Debug("claude stderr", "line", scanner.Text())
		}
	}()

	ch := make(chan StreamEvent, 64)

	go func() {
		defer close(ch)
		defer cmd.Wait()

		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)

		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}

			var raw map[string]any
			if err := json.Unmarshal([]byte(line), &raw); err != nil {
				continue
			}

			evt := StreamEvent{}

			if t, ok := raw["type"].(string); ok {
				evt.Type = t
			}

			// Capture session ID from init event
			if evt.Type == "system" {
				if sid, ok := raw["session_id"].(string); ok {
					evt.SessionID = sid
					select {
					case ch <- evt:
					case <-ctx.Done():
						return
					}
				}
				continue
			}

			// Extract text content and tool use from assistant messages
			if evt.Type == "assistant" {
				if msg, ok := raw["message"].(map[string]any); ok {
					if content, ok := msg["content"].([]any); ok {
						var texts []string
						var activities []string
						for _, c := range content {
							if block, ok := c.(map[string]any); ok {
								if block["type"] == "text" {
									if text, ok := block["text"].(string); ok {
										texts = append(texts, text)
									}
								}
								if block["type"] == "tool_use" {
									name, _ := block["name"].(string)
									input, _ := block["input"].(map[string]any)
									activity := formatActivity(name, input)
									if activity != "" {
										activities = append(activities, activity)
									}
								}
							}
						}
						evt.Content = strings.Join(texts, "")
						evt.Activity = strings.Join(activities, ", ")
					}
				}
			}

			// Handle result type (final complete text)
			if evt.Type == "result" {
				if result, ok := raw["result"].(string); ok {
					evt.Content = result
				}
				if sid, ok := raw["session_id"].(string); ok {
					evt.SessionID = sid
				}
			}

			if evt.Type == "error" {
				if errMsg, ok := raw["error"].(string); ok {
					evt.Error = errMsg
				}
			}

			if evt.Content != "" || evt.Error != "" || evt.Activity != "" {
				select {
				case ch <- evt:
				case <-ctx.Done():
					return
				}
			}
		}
	}()

	return ch, nil
}
