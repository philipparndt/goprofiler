export namespace connection {
	
	export class Target {
	    id: string;
	    url: string;
	    status: string;
	    // Go type: time
	    lastCheck?: any;
	    // Go type: time
	    lastConnected?: any;
	    label?: string;
	
	    static createFrom(source: any = {}) {
	        return new Target(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.url = source["url"];
	        this.status = source["status"];
	        this.lastCheck = this.convertValues(source["lastCheck"], null);
	        this.lastConnected = this.convertValues(source["lastConnected"], null);
	        this.label = source["label"];
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
	    // Go type: time
	    lastCheck?: any;
	    // Go type: time
	    lastConnected?: any;
	    label?: string;
	    profileCount: number;
	
	    static createFrom(source: any = {}) {
	        return new TargetWithCount(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.url = source["url"];
	        this.status = source["status"];
	        this.lastCheck = this.convertValues(source["lastCheck"], null);
	        this.lastConnected = this.convertValues(source["lastConnected"], null);
	        this.label = source["label"];
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

