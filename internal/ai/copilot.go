package ai

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"strings"

	"github.com/philipparndt/go-logger"
)

// runCopilot spawns gh copilot with the given prompt and streams plain text output.
func runCopilot(ctx context.Context, sourceDir, prompt string) (<-chan StreamEvent, error) {
	cmd := exec.CommandContext(ctx, "gh", "copilot", "-p", prompt)
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
		return nil, fmt.Errorf("start gh copilot: %w", err)
	}

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			logger.Debug("gh copilot stderr", "line", scanner.Text())
		}
	}()

	ch := make(chan StreamEvent, 64)

	go func() {
		defer close(ch)
		defer cmd.Wait()

		var sb strings.Builder
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)

		for scanner.Scan() {
			line := scanner.Text()
			sb.WriteString(line)
			sb.WriteString("\n")

			// Emit partial content as it streams
			select {
			case ch <- StreamEvent{Type: "assistant", Content: line + "\n"}:
			case <-ctx.Done():
				return
			}
		}

		// Emit final result
		if sb.Len() > 0 {
			select {
			case ch <- StreamEvent{Type: "result", Content: sb.String()}:
			case <-ctx.Done():
			}
		}
	}()

	return ch, nil
}
