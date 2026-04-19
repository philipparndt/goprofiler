# Java Sample App for GoProfiler

A simple Java application with known performance issues for testing GoProfiler's Java profiling features.

## Issues to find

- **CPU**: String concatenation in `cpuIntensiveWork()` 
- **Allocations**: Byte array allocation in `allocationHeavyWork()`
- **Lock contention**: Two threads competing on `lock` in `lockContentionA/B()`

## Run

```bash
# Compile
javac SampleApp.java

# Run with JMX enabled (for monitoring)
java -Dcom.sun.management.jmxremote.port=9999 \
     -Dcom.sun.management.jmxremote.authenticate=false \
     -Dcom.sun.management.jmxremote.ssl=false \
     SampleApp

# Or run without JMX (GoProfiler can enable it via jcmd)
java SampleApp
```

## Connect with GoProfiler

1. **Local discovery**: Open GoProfiler → Connect → Local Java → Select SampleApp
2. **Direct JMX**: Connect → Java (JMX) → `localhost:9999`

## Profile with JFR

```bash
# Start recording
jcmd <pid> JFR.start name=test settings=profile

# Wait, then stop
jcmd <pid> JFR.stop name=test filename=sample.jfr
```

## Profile with async-profiler

```bash
asprof -d 30 -o jfr -f profile.jfr <pid>
```
