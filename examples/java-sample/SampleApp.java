import java.util.*;
import java.util.concurrent.*;

/**
 * Sample Java application with known performance issues for profiling.
 *
 * Run with JMX enabled:
 *   java -Dcom.sun.management.jmxremote.port=9999 \
 *        -Dcom.sun.management.jmxremote.authenticate=false \
 *        -Dcom.sun.management.jmxremote.ssl=false \
 *        SampleApp
 *
 * Or let GoProfiler enable JMX dynamically via jcmd.
 */
public class SampleApp {
    private static final Map<String, List<byte[]>> cache = new ConcurrentHashMap<>();
    private static final Object lock = new Object();
    private static volatile boolean running = true;

    public static void main(String[] args) throws Exception {
        System.out.println("GoProfiler Java Sample App");
        System.out.println("PID: " + ProcessHandle.current().pid());
        System.out.println("Press Ctrl+C to stop");

        ExecutorService pool = Executors.newFixedThreadPool(4);

        // CPU-intensive: string processing
        pool.submit(SampleApp::cpuIntensiveWork);

        // Allocation-heavy: create lots of objects
        pool.submit(SampleApp::allocationHeavyWork);

        // Lock contention: multiple threads competing
        pool.submit(SampleApp::lockContentionA);
        pool.submit(SampleApp::lockContentionB);

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            running = false;
            pool.shutdownNow();
        }));

        Thread.currentThread().join();
    }

    static void cpuIntensiveWork() {
        while (running) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 100000; i++) {
                sb.append("x");
                if (i % 1000 == 0) {
                    sb.toString().hashCode(); // Force computation
                }
            }
            try { Thread.sleep(10); } catch (InterruptedException e) { break; }
        }
    }

    static void allocationHeavyWork() {
        Random rng = new Random();
        while (running) {
            String key = "key-" + rng.nextInt(100);
            List<byte[]> list = cache.computeIfAbsent(key, k -> new ArrayList<>());
            list.add(new byte[1024]); // 1KB allocations
            if (list.size() > 1000) {
                list.clear(); // Periodic cleanup
            }
            try { Thread.sleep(1); } catch (InterruptedException e) { break; }
        }
    }

    static void lockContentionA() {
        while (running) {
            synchronized (lock) {
                doWorkUnderLock();
            }
            try { Thread.sleep(5); } catch (InterruptedException e) { break; }
        }
    }

    static void lockContentionB() {
        while (running) {
            synchronized (lock) {
                doWorkUnderLock();
            }
            try { Thread.sleep(5); } catch (InterruptedException e) { break; }
        }
    }

    static void doWorkUnderLock() {
        // Simulate work under lock
        int sum = 0;
        for (int i = 0; i < 10000; i++) {
            sum += i * i;
        }
        if (sum == 0) System.out.print(""); // Prevent dead code elimination
    }
}
