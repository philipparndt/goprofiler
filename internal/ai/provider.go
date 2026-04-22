package ai

import (
	"context"
	"fmt"
	"os/exec"
)

type Provider string

const (
	ProviderClaude  Provider = "claude"
	ProviderCopilot Provider = "gh-copilot"
)

func CheckAvailable(provider Provider) bool {
	switch provider {
	case ProviderClaude:
		_, err := exec.LookPath("claude")
		return err == nil
	case ProviderCopilot:
		_, err := exec.LookPath("gh")
		return err == nil
	default:
		return false
	}
}

func RunWithProvider(ctx context.Context, provider Provider, sourceDir, prompt, sessionID string, permLevel PermissionLevel, model ...string) (<-chan StreamEvent, error) {
	switch provider {
	case ProviderClaude:
		return RunAnalysis(ctx, sourceDir, prompt, sessionID, permLevel, model...)
	case ProviderCopilot:
		return runCopilot(ctx, sourceDir, prompt)
	default:
		return nil, fmt.Errorf("unknown AI provider: %s", provider)
	}
}
