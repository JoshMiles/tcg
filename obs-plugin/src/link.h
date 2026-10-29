// The dock's link to TCG Bridge: reads streamdeck.json, connects to 127.0.0.1, sends the hello first, reconnects with a growing wait (ROADMAP 62.3).
// All of it runs on one worker thread of its own; `onChange` is called on that thread, so the UI must hop to its own thread (a queued call).
#pragma once

#include <condition_variable>
#include <functional>
#include <mutex>
#include <string>
#include <thread>

namespace ix {
class WebSocket;
}

namespace tcg {

enum class LinkState {
	Down,        // TCG Bridge is not running (no file, nothing listening, or the link was refused or closed)
	Connected,   // welcome received from an app new enough for the dock
	NeedsUpdate, // welcome received, but the app is older than kMinApp
};

class Link {
public:
	// `file` = the path of streamdeck.json, `pluginVersion` = sent in the hello.
	// `onMessage` gets the raw text of every message after the hello (the welcome too, right after the state change it causes), on the link's thread (62.4).
	Link(std::string file, std::string pluginVersion, std::function<void(LinkState, std::string appVersion)> onChange,
	     std::function<void(const std::string &)> onMessage);
	~Link();
	void start();
	void stop();
	// The "Try again" button: skip the wait and try now.
	void retryNow();
	// Sends one request (a body from core.h: reqPause() ...) as {t:'do', n, req} from any thread. Returns n (the answer {t:'done', n, ...} carries it), or 0 when the link is not up.
	int send(const std::string &req);

private:
	void run();
	// One connection: true when the app welcomed us. Blocks until the connection ends or stop() is called.
	bool attempt();
	void set(LinkState s, const std::string &appVersion);

	std::string file_, version_;
	std::function<void(LinkState, std::string)> onChange_;
	std::function<void(const std::string &)> onMessage_;
	std::thread thread_;
	std::mutex sendM_; // guards ws_ and up_; held while sending, so attempt() never destroys the socket under a send
	ix::WebSocket *ws_ = nullptr;
	bool up_ = false;
	int nextN_ = 0;
	std::mutex m_;
	std::condition_variable cv_;
	bool stopping_ = false;
	bool retry_ = false;
	LinkState state_ = LinkState::Down;
};

// %APPDATA%\TCG Bridge\streamdeck.json, where TCG Bridge writes it (Electron's userData for the app named "TCG Bridge"); empty when APPDATA is not set.
std::string defaultLinkFile();

} // namespace tcg
