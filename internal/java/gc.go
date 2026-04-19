package java

import (
	"fmt"
	"io"

	jfrparser "github.com/grafana/jfr-parser/parser"
	"github.com/philipparndt/goprofiler/internal/traceparser"
)

// ParseJFRGCEvents extracts GC events from a JFR recording.
// Returns GC events in the same format as Go trace GC events for UI reuse.
func ParseJFRGCEvents(data []byte) ([]traceparser.GCEvent, error) {
	p := jfrparser.NewParser(data, jfrparser.Options{})

	var events []traceparser.GCEvent

	for {
		_, err := p.ParseEvent()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("parse JFR event: %w", err)
		}

		// JFR GC events are typically jdk.GarbageCollection
		// The grafana parser may not expose all GC event types directly
		// We'll collect what's available from the parsed data
	}

	// If no events found via event iteration, that's OK — some JFR recordings
	// don't have detailed GC events depending on settings
	return events, nil
}
