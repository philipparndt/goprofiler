package k8s

import (
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestApplyProfilingOverrides(t *testing.T) {
	cases := []struct {
		name        string
		annotations map[string]string
		labels      map[string]string
		wantLang    string
		wantPort    int
	}{
		{"no overrides", nil, nil, "unknown", 0},
		{"port annotation implies go", map[string]string{"goprofiler.io/port": "6060"}, nil, "go", 6060},
		{"port via label", nil, map[string]string{"goprofiler.io/port": "6060"}, "go", 6060},
		{"java with jmx port", map[string]string{"goprofiler.io/language": "java", "goprofiler.io/port": "9999"}, nil, "java", 9999},
		{"invalid port ignored", map[string]string{"goprofiler.io/port": "not-a-port"}, nil, "unknown", 0},
		{"invalid language ignored", map[string]string{"goprofiler.io/language": "rust"}, nil, "unknown", 0},
		{"annotation wins over label", map[string]string{"goprofiler.io/port": "7070"}, map[string]string{"goprofiler.io/port": "6060"}, "go", 7070},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			pod := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{
				Annotations: tc.annotations,
				Labels:      tc.labels,
			}}
			info := &PodInfo{Language: "unknown", Containers: []ContainerInfo{{Name: "c"}}}
			applyProfilingOverrides(pod, info)
			if info.Language != tc.wantLang {
				t.Errorf("language = %q, want %q", info.Language, tc.wantLang)
			}
			if info.Containers[0].ProfilingPort != tc.wantPort {
				t.Errorf("port = %d, want %d", info.Containers[0].ProfilingPort, tc.wantPort)
			}
		})
	}
}
