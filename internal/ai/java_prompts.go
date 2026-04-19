package ai

import (
	"fmt"
	"strings"
)

func BuildJavaCPUExplainPrompt(functions []FunctionInfo, sourceDir string) string {
	var sb strings.Builder
	sb.WriteString("You are analyzing a Java application's CPU profile (from JFR). The source code is in the current directory.\n\n")
	sb.WriteString("Profile type: CPU profile — values represent CPU samples. High sample counts indicate CPU-intensive methods.\n\n")
	sb.WriteString("Top hot methods:\n\n")
	sb.WriteString(formatFunctionList(functions, 15))
	sb.WriteString("\nPlease:\n")
	sb.WriteString("1. Read the source code for the top methods\n")
	sb.WriteString("2. Explain what each hot method does and why it consumes CPU\n")
	sb.WriteString("3. Consider JVM-specific aspects: JIT compilation, garbage collection overhead, object allocation patterns\n")
	sb.WriteString("4. Suggest specific optimizations\n")
	return sb.String()
}

func BuildJavaAllocExplainPrompt(functions []FunctionInfo, sourceDir string) string {
	var sb strings.Builder
	sb.WriteString("You are analyzing a Java application's allocation profile (from JFR). The source code is in the current directory.\n\n")
	sb.WriteString("Profile type: Allocation profile — values represent bytes allocated. High values indicate allocation-heavy code paths that increase GC pressure.\n\n")
	sb.WriteString("Top allocating methods:\n\n")
	sb.WriteString(formatFunctionList(functions, 15))
	sb.WriteString("\nPlease:\n")
	sb.WriteString("1. Read the source code for the top allocating methods\n")
	sb.WriteString("2. Explain what objects are being allocated and why\n")
	sb.WriteString("3. Suggest ways to reduce allocations: object pooling, primitive types, StringBuilder vs String concat, stream vs collection, etc.\n")
	sb.WriteString("4. Assess GC impact of these allocation patterns\n")
	return sb.String()
}

func BuildJavaLockExplainPrompt(functions []FunctionInfo, sourceDir string) string {
	var sb strings.Builder
	sb.WriteString("You are analyzing a Java application's lock contention profile (from JFR). The source code is in the current directory.\n\n")
	sb.WriteString("Profile type: Lock contention — values represent time spent waiting on locks/monitors.\n\n")
	sb.WriteString("Top contended methods:\n\n")
	sb.WriteString(formatFunctionList(functions, 15))
	sb.WriteString("\nPlease:\n")
	sb.WriteString("1. Read the source code for the contended methods\n")
	sb.WriteString("2. Explain what synchronization is causing contention\n")
	sb.WriteString("3. Suggest alternatives: ConcurrentHashMap, ReentrantLock, lock-free data structures, reducing critical section scope\n")
	sb.WriteString("4. Identify if any contention is due to framework/library code vs application code\n")
	return sb.String()
}

func BuildJavaGCAnalysisPrompt(gcInfo string, sourceDir string) string {
	var sb strings.Builder
	sb.WriteString("You are analyzing garbage collection behavior of a Java application. The source code is in the current directory.\n\n")
	fmt.Fprintf(&sb, "GC Information:\n%s\n\n", gcInfo)
	sb.WriteString("Please:\n")
	sb.WriteString("1. Assess whether GC is a performance bottleneck\n")
	sb.WriteString("2. Analyze the GC collector in use and whether it's appropriate for this workload\n")
	sb.WriteString("3. Look at source code to identify allocation hot spots driving GC pressure\n")
	sb.WriteString("4. Suggest JVM tuning flags if applicable (-Xmx, -XX:+UseG1GC, etc.)\n")
	sb.WriteString("5. Suggest code changes to reduce allocation rate\n")
	return sb.String()
}
