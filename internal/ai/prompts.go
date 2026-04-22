package ai

import (
	"fmt"
	"strings"
)

type FunctionInfo struct {
	Name    string
	Flat    string
	FlatPct float64
	Cum     string
	CumPct  float64
}

func languageName(format string) string {
	if format == "jfr" || format == "java-heap-histogram" {
		return "Java"
	}
	return "Go"
}

func profileTypeDescription(profileType string) string {
	switch profileType {
	case "cpu":
		return "CPU profile — values represent CPU time consumed. High flat time means the function itself is CPU-intensive. High cumulative time means it or its callees use significant CPU."
	case "heap":
		return "Heap profile (inuse) — values represent currently live memory on the heap. High values indicate memory that is allocated and not yet garbage collected."
	case "allocs":
		return "Allocations profile — values represent total memory ever allocated (including already freed). High values indicate allocation-heavy code paths that put pressure on the garbage collector."
	case "goroutine":
		return "Goroutine profile — values represent the number of goroutines blocked at each stack. High values indicate goroutine leaks or contention."
	case "block":
		return "Block profile — values represent time goroutines spent blocked on synchronization primitives (mutexes, channels). High values indicate contention."
	case "mutex":
		return "Mutex profile — values represent contention time on mutexes. High values indicate lock contention."
	default:
		return "Performance profile — values represent resource consumption at each call site."
	}
}

func formatFunctionList(functions []FunctionInfo, limit int) string {
	var sb strings.Builder
	for i, f := range functions {
		if i >= limit {
			break
		}
		fmt.Fprintf(&sb, "- %s: flat=%s (%.1f%%), cum=%s (%.1f%%)\n",
			f.Name, f.Flat, f.FlatPct, f.Cum, f.CumPct)
	}
	return sb.String()
}

func BuildExplainPrompt(functions []FunctionInfo, sourceDir, profileType string, format ...string) string {
	lang := "Go"
	if len(format) > 0 {
		lang = languageName(format[0])
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "You are analyzing a %s application's performance profile. ", lang)
	sb.WriteString("The source code is in the current directory.\n\n")
	fmt.Fprintf(&sb, "Profile type: %s\n\n", profileTypeDescription(profileType))
	sb.WriteString("Here are the top hot functions from the profile (sorted by cumulative cost):\n\n")
	sb.WriteString(formatFunctionList(functions, 15))
	sb.WriteString("\nPlease:\n")
	sb.WriteString("1. Read the source code for the top functions\n")
	sb.WriteString("2. Explain what each hot function does and why it consumes resources (in context of this profile type)\n")
	sb.WriteString("3. Identify the critical hot path through the code\n")
	sb.WriteString("4. Keep the explanation concise and actionable\n")

	return sb.String()
}

func BuildOptimizePrompt(functions []FunctionInfo, sourceDir, profileType string, format ...string) string {
	lang := "Go"
	if len(format) > 0 {
		lang = languageName(format[0])
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "You are analyzing a %s application's performance profile to suggest optimizations. ", lang)
	sb.WriteString("The source code is in the current directory.\n\n")
	fmt.Fprintf(&sb, "Profile type: %s\n\n", profileTypeDescription(profileType))
	sb.WriteString("Here are the top hot functions from the profile:\n\n")
	sb.WriteString(formatFunctionList(functions, 15))
	sb.WriteString("\nPlease:\n")
	sb.WriteString("1. Read the source code for the hot functions\n")
	sb.WriteString("2. Suggest concrete code optimizations to reduce the profiled resource usage\n")
	sb.WriteString("3. Show specific code changes (before/after) where applicable\n")
	sb.WriteString("4. Prioritize suggestions by potential impact\n")
	sb.WriteString("5. Note any trade-offs (readability, correctness) for each suggestion\n")

	return sb.String()
}

func BuildExplainFunctionPrompt(functionName string, subtreeFunctions []FunctionInfo, profileType string, format ...string) string {
	lang := "Go"
	if len(format) > 0 {
		lang = languageName(format[0])
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "You are analyzing a %s application's performance profile. ", lang)
	sb.WriteString("The source code is in the current directory.\n\n")
	fmt.Fprintf(&sb, "Profile type: %s\n\n", profileTypeDescription(profileType))
	fmt.Fprintf(&sb, "The user selected this function in the flame graph: **%s**\n\n", functionName)

	if len(subtreeFunctions) > 0 {
		sb.WriteString("Here is the cost breakdown for this function and everything it calls (the subtree from the flame graph):\n\n")
		sb.WriteString(formatFunctionList(subtreeFunctions, 20))
		sb.WriteString("\n")
	}

	sb.WriteString("Please:\n")
	sb.WriteString("1. Find and read the source code for this function\n")
	sb.WriteString("2. Explain what it does, focusing on WHY it shows up as costly in this specific profile type\n")
	sb.WriteString("3. If the subtree shows callees consuming significant resources, explain those too\n")
	sb.WriteString("4. Suggest specific optimizations if there are obvious opportunities\n")
	sb.WriteString("5. Be concrete — reference actual code patterns, not generic advice\n")

	return sb.String()
}
