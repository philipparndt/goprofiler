package expvar

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

func Probe(client *http.Client, baseURL string) bool {
	resp, err := client.Head(baseURL + "/debug/vars")
	if err != nil {
		// HEAD may not be supported, try GET
		resp, err = client.Get(baseURL + "/debug/vars")
		if err != nil {
			return false
		}
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func Fetch(client *http.Client, baseURL string) (json.RawMessage, time.Time, error) {
	resp, err := client.Get(baseURL + "/debug/vars")
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("fetch expvars: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, time.Time{}, fmt.Errorf("expvars returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return nil, time.Time{}, fmt.Errorf("read expvars: %w", err)
	}

	return json.RawMessage(body), time.Now(), nil
}
