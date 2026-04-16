package flamegraph

import (
	"regexp"

	"github.com/google/pprof/profile"
)

var pprofOverheadRx = regexp.MustCompile(`^(runtime/pprof|net/http/pprof)\.`)

// FilterPprofOverhead removes samples from the profile where any function
// in the call stack matches pprof infrastructure (runtime/pprof.*, net/http/pprof.*).
// Entire samples are removed so that totals (inuse/alloc) are recalculated correctly.
// The profile is modified in-place.
func FilterPprofOverhead(p *profile.Profile) {
	filtered := make([]*profile.Sample, 0, len(p.Sample))
	for _, s := range p.Sample {
		if sampleContainsPprof(s) {
			continue
		}
		filtered = append(filtered, s)
	}
	p.Sample = filtered
}

func sampleContainsPprof(s *profile.Sample) bool {
	for _, loc := range s.Location {
		for _, line := range loc.Line {
			if line.Function != nil && pprofOverheadRx.MatchString(line.Function.Name) {
				return true
			}
		}
	}
	return false
}
