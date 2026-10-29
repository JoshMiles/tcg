// The dock's link to TCG Bridge: reads streamdeck.json, connects to 127.0.0.1, sends the hello first, reconnects with a growing wait (ROADMAP 62.3).
// All of it runs on one worker thread of its own; `onChange` is called on that thread, so the UI must hop to its own thread (a queued call).
#pragma once

#include <condition_variable>
#include <functional>
#include <mutex>
#include <string>
#include <thread>

namespace tcg {

enum class LinkState {
	Down,        // TCG Bridge is not running (no file, nothing listening, or the link was refused or closed)
	Connected,   // welcome received from an app new enough for the dock
	NeedsUpdate, // welcome received, but the app is older than kMinApp
};

class Link {
public:
	// `file` = the path of streamdeck.json, `pluginVersion` = sent in the hello.
	Link(std::string file, std::string pluginVersion, std::function<void(LinkState, std::string appVersion)> onChange);
	~Link();
	void start();
	void stop();
	// The "Try again" button: skip the wait and try now.
	void retryNow();

private:
	void run();
	// One connection: true when the app welcomed us. Blocks until the connection ends or stop() is called.
	bool attempt();
	void set(LinkState s, const std::string &appVersion);

	std::string file_, version_;
	std::function<void(LinkState, std::string)> onChange_;
	std::thread thread_;
	std::mutex m_;
	std::condition_variable cv_;
	bool stopping_ = false;
	bool retry_ = false;
	LinkState state_ = LinkState::Down;
};

// %APPDATA%\TCG Bridge\streamdeck.json, where TCG Bridge writes it (Electron's userData for the app named "TCG Bridge"); empty when APPDATA is not set.
std::string defaultLinkFile();

} // namespace tcg
