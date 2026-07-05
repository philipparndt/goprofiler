export namespace ai {
	
	export class FunctionInfo {
	    Name: string;
	    Flat: string;
	    FlatPct: number;
	    Cum: string;
	    CumPct: number;
	
	    static createFrom(source: any = {}) {
	        return new FunctionInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Flat = source["Flat"];
	        this.FlatPct = source["FlatPct"];
	        this.Cum = source["Cum"];
	        this.CumPct = source["CumPct"];
	    }
	}
	export class AnalysisRequest {
	    targetId: string;
	    profileId: string;
	    mode: string;
	    profileType?: string;
	    functionName?: string;
	    functions?: FunctionInfo[];
	    format?: string;
	    permissionLevel?: string;
	
	    static createFrom(source: any = {}) {
	        return new AnalysisRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.targetId = source["targetId"];
	        this.profileId = source["profileId"];
	        this.mode = source["mode"];
	        this.profileType = source["profileType"];
	        this.functionName = source["functionName"];
	        this.functions = this.convertValues(source["functions"], FunctionInfo);
	        this.format = source["format"];
	        this.permissionLevel = source["permissionLevel"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FollowUpRequest {
	    targetUrl: string;
	    message: string;
	    permissionLevel?: string;
	
	    static createFrom(source: any = {}) {
	        return new FollowUpRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.targetUrl = source["targetUrl"];
	        this.message = source["message"];
	        this.permissionLevel = source["permissionLevel"];
	    }
	}
	
	export class GoroutineSpanInfo {
	    state: string;
	    start: number;
	    end: number;
	    reason?: string;
	    stack?: string[];
	
	    static createFrom(source: any = {}) {
	        return new GoroutineSpanInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.state = source["state"];
	        this.start = source["start"];
	        this.end = source["end"];
	        this.reason = source["reason"];
	        this.stack = source["stack"];
	    }
	}
	export class ProviderInfo {
	    id: string;
	    name: string;
	    available: boolean;
	    active: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ProviderInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.available = source["available"];
	        this.active = source["active"];
	    }
	}
	export class TraceAnalysisRequest {
	    targetUrl: string;
	    profileId: string;
	    mode: string;
	    goroutineId?: number;
	    blockingIdx?: number;
	    span?: GoroutineSpanInfo;
	    goroutineName?: string;
	    adjacentSpans?: GoroutineSpanInfo[];
	
	    static createFrom(source: any = {}) {
	        return new TraceAnalysisRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.targetUrl = source["targetUrl"];
	        this.profileId = source["profileId"];
	        this.mode = source["mode"];
	        this.goroutineId = source["goroutineId"];
	        this.blockingIdx = source["blockingIdx"];
	        this.span = this.convertValues(source["span"], GoroutineSpanInfo);
	        this.goroutineName = source["goroutineName"];
	        this.adjacentSpans = this.convertValues(source["adjacentSpans"], GoroutineSpanInfo);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace connection {
	
	export class Target {
	    id: string;
	    url: string;
	    status: string;
	    language: string;
	    connectionMethod?: string;
	    // Go type: time
	    lastCheck?: any;
	    // Go type: time
	    lastConnected?: any;
	    label?: string;
	    sourceDir?: string;
	    localPid?: number;
	    javaMainClass?: string;
	    k8sContext?: string;
	    k8sNamespace?: string;
	    k8sPod?: string;
	    k8sPort?: number;
	    k8sWorkloadKind?: string;
	    k8sWorkloadName?: string;
	
	    static createFrom(source: any = {}) {
	        return new Target(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.url = source["url"];
	        this.status = source["status"];
	        this.language = source["language"];
	        this.connectionMethod = source["connectionMethod"];
	        this.lastCheck = this.convertValues(source["lastCheck"], null);
	        this.lastConnected = this.convertValues(source["lastConnected"], null);
	        this.label = source["label"];
	        this.sourceDir = source["sourceDir"];
	        this.localPid = source["localPid"];
	        this.javaMainClass = source["javaMainClass"];
	        this.k8sContext = source["k8sContext"];
	        this.k8sNamespace = source["k8sNamespace"];
	        this.k8sPod = source["k8sPod"];
	        this.k8sPort = source["k8sPort"];
	        this.k8sWorkloadKind = source["k8sWorkloadKind"];
	        this.k8sWorkloadName = source["k8sWorkloadName"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace java {
	
	export class JmxThread {
	    id: number;
	    name: string;
	    state: string;
	    deadlocked: boolean;
	    stack?: string[];
	    waitingOn?: string;
	    lockOwner?: string;
	
	    static createFrom(source: any = {}) {
	        return new JmxThread(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.state = source["state"];
	        this.deadlocked = source["deadlocked"];
	        this.stack = source["stack"];
	        this.waitingOn = source["waitingOn"];
	        this.lockOwner = source["lockOwner"];
	    }
	}
	export class JmxThreadDump {
	    threads: JmxThread[];
	    deadlockCount: number;
	
	    static createFrom(source: any = {}) {
	        return new JmxThreadDump(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.threads = this.convertValues(source["threads"], JmxThread);
	        this.deadlockCount = source["deadlockCount"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class LocalJVM {
	    pid: number;
	    mainClass: string;
	    args?: string;
	    jmxPort?: number;
	    asprofAvailable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new LocalJVM(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pid = source["pid"];
	        this.mainClass = source["mainClass"];
	        this.args = source["args"];
	        this.jmxPort = source["jmxPort"];
	        this.asprofAvailable = source["asprofAvailable"];
	    }
	}

}

export namespace k8s {
	
	export class ContainerInfo {
	    name: string;
	    image: string;
	    profilingPort?: number;
	
	    static createFrom(source: any = {}) {
	        return new ContainerInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.image = source["image"];
	        this.profilingPort = source["profilingPort"];
	    }
	}
	export class PodInfo {
	    name: string;
	    namespace: string;
	    status: string;
	    age: string;
	    containers: ContainerInfo[];
	    language: string;
	    labels?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new PodInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.namespace = source["namespace"];
	        this.status = source["status"];
	        this.age = source["age"];
	        this.containers = this.convertValues(source["containers"], ContainerInfo);
	        this.language = source["language"];
	        this.labels = source["labels"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class KubeContext {
	    name: string;
	    cluster: string;
	    namespace?: string;
	    isCurrent: boolean;
	
	    static createFrom(source: any = {}) {
	        return new KubeContext(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.cluster = source["cluster"];
	        this.namespace = source["namespace"];
	        this.isCurrent = source["isCurrent"];
	    }
	}
	export class DiscoveryResult {
	    currentContext: string;
	    contexts: KubeContext[];
	    namespaces: string[];
	    pods: PodInfo[];
	    podsError?: string;
	
	    static createFrom(source: any = {}) {
	        return new DiscoveryResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.currentContext = source["currentContext"];
	        this.contexts = this.convertValues(source["contexts"], KubeContext);
	        this.namespaces = source["namespaces"];
	        this.pods = this.convertValues(source["pods"], PodInfo);
	        this.podsError = source["podsError"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	

}

export namespace main {
	
	export class TargetWithCount {
	    id: string;
	    url: string;
	    status: string;
	    language: string;
	    connectionMethod?: string;
	    // Go type: time
	    lastCheck?: any;
	    // Go type: time
	    lastConnected?: any;
	    label?: string;
	    sourceDir?: string;
	    localPid?: number;
	    javaMainClass?: string;
	    k8sContext?: string;
	    k8sNamespace?: string;
	    k8sPod?: string;
	    k8sPort?: number;
	    k8sWorkloadKind?: string;
	    k8sWorkloadName?: string;
	    profileCount: number;
	
	    static createFrom(source: any = {}) {
	        return new TargetWithCount(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.url = source["url"];
	        this.status = source["status"];
	        this.language = source["language"];
	        this.connectionMethod = source["connectionMethod"];
	        this.lastCheck = this.convertValues(source["lastCheck"], null);
	        this.lastConnected = this.convertValues(source["lastConnected"], null);
	        this.label = source["label"];
	        this.sourceDir = source["sourceDir"];
	        this.localPid = source["localPid"];
	        this.javaMainClass = source["javaMainClass"];
	        this.k8sContext = source["k8sContext"];
	        this.k8sNamespace = source["k8sNamespace"];
	        this.k8sPod = source["k8sPod"];
	        this.k8sPort = source["k8sPort"];
	        this.k8sWorkloadKind = source["k8sWorkloadKind"];
	        this.k8sWorkloadName = source["k8sWorkloadName"];
	        this.profileCount = source["profileCount"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace storage {
	
	export class ProfileRecord {
	    id: string;
	    targetURL: string;
	    type: string;
	    format?: string;
	    // Go type: time
	    timestamp: any;
	    durationSec?: number;
	    size: number;
	    label?: string;
	    tags: string;
	
	    static createFrom(source: any = {}) {
	        return new ProfileRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.targetURL = source["targetURL"];
	        this.type = source["type"];
	        this.format = source["format"];
	        this.timestamp = this.convertValues(source["timestamp"], null);
	        this.durationSec = source["durationSec"];
	        this.size = source["size"];
	        this.label = source["label"];
	        this.tags = source["tags"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace traceparser {
	
	export class BlockingEntry {
	    location: string;
	    category: string;
	    totalDuration: number;
	    count: number;
	    stack?: string[];
	
	    static createFrom(source: any = {}) {
	        return new BlockingEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.location = source["location"];
	        this.category = source["category"];
	        this.totalDuration = source["totalDuration"];
	        this.count = source["count"];
	        this.stack = source["stack"];
	    }
	}
	export class GCEvent {
	    start: number;
	    end: number;
	    pauseNs: number;
	
	    static createFrom(source: any = {}) {
	        return new GCEvent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.start = source["start"];
	        this.end = source["end"];
	        this.pauseNs = source["pauseNs"];
	    }
	}
	export class GoroutineSpan {
	    start: number;
	    end: number;
	    state: string;
	    reason?: string;
	    processor?: number;
	    stack?: string[];
	
	    static createFrom(source: any = {}) {
	        return new GoroutineSpan(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.start = source["start"];
	        this.end = source["end"];
	        this.state = source["state"];
	        this.reason = source["reason"];
	        this.processor = source["processor"];
	        this.stack = source["stack"];
	    }
	}
	export class GoroutineData {
	    id: number;
	    name: string;
	    spans: GoroutineSpan[];
	
	    static createFrom(source: any = {}) {
	        return new GoroutineData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.spans = this.convertValues(source["spans"], GoroutineSpan);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ProcessorSpan {
	    start: number;
	    end: number;
	    goroutineId: number;
	
	    static createFrom(source: any = {}) {
	        return new ProcessorSpan(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.start = source["start"];
	        this.end = source["end"];
	        this.goroutineId = source["goroutineId"];
	    }
	}
	export class ProcessorData {
	    id: number;
	    spans: ProcessorSpan[];
	
	    static createFrom(source: any = {}) {
	        return new ProcessorData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.spans = this.convertValues(source["spans"], ProcessorSpan);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class TraceMeta {
	    durationNs: number;
	    goroutineCount: number;
	    processorCount: number;
	    gcCount: number;
	
	    static createFrom(source: any = {}) {
	        return new TraceMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.durationNs = source["durationNs"];
	        this.goroutineCount = source["goroutineCount"];
	        this.processorCount = source["processorCount"];
	        this.gcCount = source["gcCount"];
	    }
	}
	export class TraceData {
	    meta: TraceMeta;
	    goroutines: GoroutineData[];
	    gcEvents: GCEvent[];
	    processors: ProcessorData[];
	    blockingSummary: BlockingEntry[];
	
	    static createFrom(source: any = {}) {
	        return new TraceData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.meta = this.convertValues(source["meta"], TraceMeta);
	        this.goroutines = this.convertValues(source["goroutines"], GoroutineData);
	        this.gcEvents = this.convertValues(source["gcEvents"], GCEvent);
	        this.processors = this.convertValues(source["processors"], ProcessorData);
	        this.blockingSummary = this.convertValues(source["blockingSummary"], BlockingEntry);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

