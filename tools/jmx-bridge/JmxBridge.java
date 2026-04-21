import javax.management.*;
import javax.management.openmbean.CompositeData;
import javax.management.remote.*;
import java.io.*;
import java.lang.management.*;
import java.util.*;

/**
 * JMX Bridge — connects to a JVM via JMX and outputs MBean data as JSON.
 *
 * Usage:
 *   java JmxBridge <host:port|jmx-url> monitor     # continuous JSON streaming
 *   java JmxBridge <host:port|jmx-url> threads      # thread dump
 *   java JmxBridge <host:port|jmx-url> snapshot      # one-shot MBean snapshot
 *   java JmxBridge <host:port|jmx-url> jfr start <name> [settings]
 *   java JmxBridge <host:port|jmx-url> jfr stop <name> <file>
 *   java JmxBridge <host:port|jmx-url> jfr dump <name> <file>
 */
public class JmxBridge {
    private MBeanServerConnection mbs;
    private JMXConnector connector;

    public static void main(String[] args) {
        if (args.length < 2) {
            System.err.println("Usage: java JmxBridge <jmx-url> <command> [args...]");
            System.exit(1);
        }

        String url = args[0];
        String command = args[1];

        try {
            JmxBridge bridge = new JmxBridge();
            bridge.connect(url);

            switch (command) {
                case "monitor":
                    bridge.monitor();
                    break;
                case "snapshot":
                    bridge.snapshot();
                    break;
                case "threads":
                    bridge.threadDump();
                    break;
                case "heap":
                    bridge.heapHistogram();
                    break;
                case "jfr":
                    if (args.length < 4) {
                        System.err.println("Usage: jfr start|stop|dump <name> [file] [settings]");
                        System.exit(1);
                    }
                    bridge.jfr(Arrays.copyOfRange(args, 2, args.length));
                    break;
                default:
                    System.err.println("Unknown command: " + command);
                    System.exit(1);
            }
        } catch (Exception e) {
            System.out.println("{\"error\":\"" + escapeJson(e.getMessage()) + "\"}");
            System.exit(1);
        }
    }

    void connect(String url) throws Exception {
        String jmxUrl;
        if (url.startsWith("service:jmx:")) {
            jmxUrl = url;
        } else {
            // host:port shorthand
            String host = "localhost";
            String port = url;
            if (url.contains(":")) {
                String[] parts = url.split(":", 2);
                host = parts[0];
                port = parts[1];
            }
            jmxUrl = "service:jmx:rmi:///jndi/rmi://" + host + ":" + port + "/jmxrmi";
        }

        JMXServiceURL serviceUrl = new JMXServiceURL(jmxUrl);
        connector = JMXConnectorFactory.connect(serviceUrl);
        mbs = connector.getMBeanServerConnection();
    }

    void monitor() throws Exception {
        while (true) {
            snapshot();
            System.out.flush();
            Thread.sleep(1000);
        }
    }

    void snapshot() throws Exception {
        StringBuilder sb = new StringBuilder();
        sb.append("{");

        // Heap memory
        CompositeData heapUsage = (CompositeData) mbs.getAttribute(
            new ObjectName("java.lang:type=Memory"), "HeapMemoryUsage");
        sb.append("\"heap\":{");
        sb.append("\"used\":").append(heapUsage.get("used")).append(",");
        sb.append("\"committed\":").append(heapUsage.get("committed")).append(",");
        sb.append("\"max\":").append(heapUsage.get("max"));
        sb.append("},");

        // Non-heap memory
        CompositeData nonHeapUsage = (CompositeData) mbs.getAttribute(
            new ObjectName("java.lang:type=Memory"), "NonHeapMemoryUsage");
        sb.append("\"nonHeap\":{");
        sb.append("\"used\":").append(nonHeapUsage.get("used")).append(",");
        sb.append("\"committed\":").append(nonHeapUsage.get("committed"));
        sb.append("},");

        // Memory pools
        sb.append("\"pools\":[");
        Set<ObjectName> poolNames = mbs.queryNames(new ObjectName("java.lang:type=MemoryPool,*"), null);
        boolean firstPool = true;
        for (ObjectName pool : poolNames) {
            if (!firstPool) sb.append(",");
            firstPool = false;
            String name = (String) mbs.getAttribute(pool, "Name");
            String type = mbs.getAttribute(pool, "Type").toString();
            CompositeData usage = (CompositeData) mbs.getAttribute(pool, "Usage");
            sb.append("{\"name\":\"").append(escapeJson(name)).append("\",");
            sb.append("\"type\":\"").append(type).append("\",");
            sb.append("\"used\":").append(usage.get("used")).append(",");
            sb.append("\"committed\":").append(usage.get("committed")).append(",");
            sb.append("\"max\":").append(usage.get("max")).append("}");
        }
        sb.append("],");

        // GC collectors
        sb.append("\"gc\":[");
        Set<ObjectName> gcNames = mbs.queryNames(new ObjectName("java.lang:type=GarbageCollector,*"), null);
        boolean firstGc = true;
        for (ObjectName gc : gcNames) {
            if (!firstGc) sb.append(",");
            firstGc = false;
            String name = (String) mbs.getAttribute(gc, "Name");
            long count = (Long) mbs.getAttribute(gc, "CollectionCount");
            long time = (Long) mbs.getAttribute(gc, "CollectionTime");
            sb.append("{\"name\":\"").append(escapeJson(name)).append("\",");
            sb.append("\"count\":").append(count).append(",");
            sb.append("\"timeMs\":").append(time).append("}");
        }
        sb.append("],");

        // Threads
        int threadCount = (Integer) mbs.getAttribute(new ObjectName("java.lang:type=Threading"), "ThreadCount");
        int daemonCount = (Integer) mbs.getAttribute(new ObjectName("java.lang:type=Threading"), "DaemonThreadCount");
        int peakCount = (Integer) mbs.getAttribute(new ObjectName("java.lang:type=Threading"), "PeakThreadCount");
        sb.append("\"threads\":{\"count\":").append(threadCount);
        sb.append(",\"daemon\":").append(daemonCount);
        sb.append(",\"peak\":").append(peakCount).append("},");

        // CPU
        try {
            ObjectName osName = new ObjectName("java.lang:type=OperatingSystem");
            double processCpu = toDouble(mbs.getAttribute(osName, "ProcessCpuLoad"));
            double systemCpu = toDouble(mbs.getAttribute(osName, "SystemCpuLoad"));
            sb.append("\"cpu\":{\"process\":").append(String.format("%.4f", processCpu));
            sb.append(",\"system\":").append(String.format("%.4f", systemCpu)).append("},");
        } catch (Exception e) {
            sb.append("\"cpu\":{\"process\":0,\"system\":0},");
        }

        // Class loading
        try {
            ObjectName clName = new ObjectName("java.lang:type=ClassLoading");
            int loaded = (Integer) mbs.getAttribute(clName, "LoadedClassCount");
            long unloaded = (Long) mbs.getAttribute(clName, "UnloadedClassCount");
            sb.append("\"classes\":{\"loaded\":").append(loaded);
            sb.append(",\"unloaded\":").append(unloaded).append("},");
        } catch (Exception e) {
            sb.append("\"classes\":{\"loaded\":0,\"unloaded\":0},");
        }

        // JIT compilation
        try {
            long jitTime = (Long) mbs.getAttribute(new ObjectName("java.lang:type=Compilation"), "TotalCompilationTime");
            sb.append("\"jit\":{\"totalTimeMs\":").append(jitTime).append("},");
        } catch (Exception e) {
            sb.append("\"jit\":{\"totalTimeMs\":0},");
        }

        // Runtime
        try {
            ObjectName rtName = new ObjectName("java.lang:type=Runtime");
            long uptime = (Long) mbs.getAttribute(rtName, "Uptime");
            String vmName = (String) mbs.getAttribute(rtName, "VmName");
            String vmVersion = (String) mbs.getAttribute(rtName, "VmVersion");
            sb.append("\"runtime\":{\"uptimeMs\":").append(uptime);
            sb.append(",\"vmName\":\"").append(escapeJson(vmName)).append("\"");
            sb.append(",\"vmVersion\":\"").append(escapeJson(vmVersion)).append("\"}");
        } catch (Exception e) {
            sb.append("\"runtime\":{\"uptimeMs\":0,\"vmName\":\"\",\"vmVersion\":\"\"}");
        }

        sb.append("}");
        System.out.println(sb.toString());
    }

    void threadDump() throws Exception {
        ObjectName threadName = new ObjectName("java.lang:type=Threading");

        // Get all thread IDs
        long[] threadIds = (long[]) mbs.getAttribute(threadName, "AllThreadIds");

        // Get thread infos with stack traces and lock info
        CompositeData[] threads = (CompositeData[]) mbs.invoke(
            threadName, "getThreadInfo",
            new Object[]{threadIds, true, true},
            new String[]{"[J", "boolean", "boolean"});

        // Detect deadlocks
        long[] deadlockedIds = (long[]) mbs.invoke(threadName, "findDeadlockedThreads", null, null);
        Set<Long> deadlocked = new HashSet<>();
        if (deadlockedIds != null) {
            for (long id : deadlockedIds) deadlocked.add(id);
        }

        StringBuilder sb = new StringBuilder();
        sb.append("{\"threads\":[");

        boolean first = true;
        for (CompositeData td : threads) {
            if (td == null) continue;
            if (!first) sb.append(",");
            first = false;

            long id = (Long) td.get("threadId");
            String name = (String) td.get("threadName");
            String state = td.get("threadState").toString();
            boolean isDead = deadlocked.contains(id);

            sb.append("{\"id\":").append(id);
            sb.append(",\"name\":\"").append(escapeJson(name)).append("\"");
            sb.append(",\"state\":\"").append(state).append("\"");
            sb.append(",\"deadlocked\":").append(isDead);

            // Stack trace
            CompositeData[] stackTrace = (CompositeData[]) td.get("stackTrace");
            if (stackTrace != null && stackTrace.length > 0) {
                sb.append(",\"stack\":[");
                for (int i = 0; i < stackTrace.length; i++) {
                    if (i > 0) sb.append(",");
                    String className = (String) stackTrace[i].get("className");
                    String methodName = (String) stackTrace[i].get("methodName");
                    int lineNumber = (Integer) stackTrace[i].get("lineNumber");
                    sb.append("\"").append(escapeJson(className)).append(".").append(escapeJson(methodName));
                    if (lineNumber > 0) sb.append(":").append(lineNumber);
                    sb.append("\"");
                }
                sb.append("]");
            }

            // Lock info
            CompositeData lockInfo = (CompositeData) td.get("lockInfo");
            if (lockInfo != null) {
                String lockClass = (String) lockInfo.get("className");
                sb.append(",\"waitingOn\":\"").append(escapeJson(lockClass)).append("\"");
            }

            long lockOwnerId = (Long) td.get("lockOwnerId");
            if (lockOwnerId >= 0) {
                String lockOwnerName = (String) td.get("lockOwnerName");
                sb.append(",\"lockOwner\":\"").append(escapeJson(lockOwnerName)).append("\"");
            }

            sb.append("}");
        }

        sb.append("],\"deadlockCount\":").append(deadlocked.size()).append("}");
        System.out.println(sb.toString());
    }

    void heapHistogram() throws Exception {
        // Use DiagnosticCommandMBean to run GC.class_histogram (same as jcmd)
        ObjectName diagCmd = new ObjectName("com.sun.management:type=DiagnosticCommand");
        String result;
        try {
            result = (String) mbs.invoke(diagCmd, "gcClassHistogram",
                new Object[]{new String[]{"-all"}},
                new String[]{"[Ljava.lang.String;"});
        } catch (Exception e) {
            // Fallback: try without -all flag
            try {
                result = (String) mbs.invoke(diagCmd, "gcClassHistogram",
                    new Object[]{new String[]{}},
                    new String[]{"[Ljava.lang.String;"});
            } catch (Exception e2) {
                System.out.println("{\"error\":\"DiagnosticCommandMBean not available: " + escapeJson(e2.getMessage()) + "\"}");
                return;
            }
        }

        // Parse the class histogram output
        // Format: "num  #instances  #bytes  class name\n  1:  12345  6789012  java.lang.String"
        StringBuilder sb = new StringBuilder();
        sb.append("{\"classes\":[");
        long totalInstances = 0, totalBytes = 0;
        boolean first = true;

        for (String line : result.split("\n")) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("num") || line.startsWith("---")) continue;

            if (line.startsWith("Total")) {
                String[] fields = line.split("\\s+");
                if (fields.length >= 3) {
                    try { totalInstances = Long.parseLong(fields[1]); } catch (Exception ignored) {}
                    try { totalBytes = Long.parseLong(fields[2]); } catch (Exception ignored) {}
                }
                continue;
            }

            // Parse "rank:  instances  bytes  className"
            line = line.replace(":", " ");
            String[] fields = line.split("\\s+");
            if (fields.length < 4) continue;

            try {
                long instances = Long.parseLong(fields[1]);
                long bytes = Long.parseLong(fields[2]);
                String className = fields[3];

                // Clean array notation
                if (className.equals("[B")) className = "byte[]";
                else if (className.equals("[C")) className = "char[]";
                else if (className.equals("[I")) className = "int[]";
                else if (className.equals("[J")) className = "long[]";
                else if (className.equals("[D")) className = "double[]";
                else if (className.startsWith("[L") && className.endsWith(";"))
                    className = className.substring(2, className.length() - 1) + "[]";

                if (!first) sb.append(",");
                first = false;
                sb.append("{\"className\":\"").append(escapeJson(className)).append("\",");
                sb.append("\"instances\":").append(instances).append(",");
                sb.append("\"bytes\":").append(bytes).append("}");
            } catch (NumberFormatException ignored) {}
        }

        sb.append("],\"totalInstances\":").append(totalInstances);
        sb.append(",\"totalBytes\":").append(totalBytes).append("}");
        System.out.println(sb.toString());
    }

    void jfr(String[] args) throws Exception {
        String action = args[0];
        String name = args[1];

        ObjectName jfrBean = null;
        Set<ObjectName> jfrBeans = mbs.queryNames(new ObjectName("jdk.management.jfr:type=FlightRecorder"), null);
        if (!jfrBeans.isEmpty()) {
            jfrBean = jfrBeans.iterator().next();
        }
        if (jfrBean == null) {
            System.out.println("{\"error\":\"FlightRecorderMXBean not available\"}");
            return;
        }

        switch (action) {
            case "start": {
                String settings = args.length > 2 ? args[2] : "profile";
                // Start recording via FlightRecorderMXBean
                long recId = (Long) mbs.invoke(jfrBean, "newRecording", null, null);
                // Set predefined settings
                mbs.invoke(jfrBean, "setPredefinedConfiguration",
                    new Object[]{recId, settings},
                    new String[]{"long", "java.lang.String"});
                mbs.invoke(jfrBean, "startRecording", new Object[]{recId}, new String[]{"long"});
                System.out.println("{\"recordingId\":" + recId + ",\"name\":\"" + escapeJson(name) + "\",\"status\":\"started\"}");
                break;
            }
            case "stop": {
                String file = args.length > 2 ? args[2] : "/tmp/jfr-" + name + ".jfr";
                // Find recording by iterating
                // For simplicity, stop the most recent recording
                mbs.invoke(jfrBean, "copyTo",
                    new Object[]{Long.parseLong(name), file},
                    new String[]{"long", "java.lang.String"});
                mbs.invoke(jfrBean, "stopRecording",
                    new Object[]{Long.parseLong(name)},
                    new String[]{"long"});
                System.out.println("{\"file\":\"" + escapeJson(file) + "\",\"status\":\"stopped\"}");
                break;
            }
            case "dump": {
                String file = args.length > 2 ? args[2] : "/tmp/jfr-" + name + ".jfr";
                mbs.invoke(jfrBean, "copyTo",
                    new Object[]{Long.parseLong(name), file},
                    new String[]{"long", "java.lang.String"});
                System.out.println("{\"file\":\"" + escapeJson(file) + "\",\"status\":\"dumped\"}");
                break;
            }
        }
    }

    static double toDouble(Object val) {
        if (val instanceof Double) return (Double) val;
        if (val instanceof Number) return ((Number) val).doubleValue();
        return 0;
    }

    static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
    }
}
