package remote

import "testing"

func TestAssetFileNameUsesMP4ForYouTube(t *testing.T) {
	item := ManifestPlaylistItem{AssetID: "asset-1", URL: "https://youtu.be/example", SourceType: "youtube"}
	if got := AssetFileName(item); got != "asset-1.mp4" {
		t.Fatalf("unexpected file name %q", got)
	}
}

func TestIsYouTubeURLRejectsLookalikeHosts(t *testing.T) {
	if IsYouTubeURL("https://youtube.com.evil.example/watch?v=1") {
		t.Fatal("lookalike host was accepted")
	}
	if !IsYouTubeURL("https://www.youtube.com/watch?v=1") {
		t.Fatal("canonical YouTube host was rejected")
	}
}
