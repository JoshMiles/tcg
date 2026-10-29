#include "link.h"
#include "core.h"

#include <ixwebsocket/IXWebSocket.h>

#include <chrono>
#include <cstdlib>
#include <fstream>
#include <sstream>

namespace tcg {

std::string defaultLinkFile()
{
	const char *appdata = std::getenv("APPDATA");
	return appdata && *appdata ? std::string(appdata) + "\\TCG Bridge\\streamdeck.json" : std::string();
}

Link::Link(std::string file, std::string pluginVersion, std::function<void(LinkState, std::string)> onChange,
	   std::function<void(const std::string &)> onMessage)
	: file_(std::move(file)), version_(std::move(pluginVersion)), onChange_(std::move(onChange)), onMessage_(std::move(onMessage))
{
}

int Link::send(const std::string &req)
{
	std::lock_guard<std::mutex> lock(sendM_);
	if (!ws_ || !up_)
		return 0;
	int n = ++nextN_;
	ws_->send(buildDo(n, req));
	return n;
}

Link::~Link()
{
	stop();
}

void Link::start()
{
	if (thread_.joinable())
		return;
	thread_ = std::thread([this] { run(); });
}

void Link::stop()
{
	{
		std::lock_guard<std::mutex> lock(m_);
		stopping_ = true;
	}
	cv_.notify_all();
	if (thread_.joinable())
		thread_.join();
}

void Link::retryNow()
{
	{
		std::lock_guard<std::mutex> lock(m_);
		retry_ = true;
	}
	cv_.notify_all();
}

void Link::set(LinkState s, const std::string &appVersion)
{
	{
		std::lock_guard<std::mutex> lock(m_);
		if (s == state_)
			return;
		state_ = s;
	}
	if (onChange_)
		onChange_(s, appVersion);
}

void Link::run()
{
	int failures = 0;
	for (;;) {
		bool welcomed = attempt();
		{
			std::lock_guard<std::mutex> lock(m_);
			if (stopping_)
				return;
		}
		set(LinkState::Down, "");
		failures = welcomed ? 0 : failures + 1;
		std::unique_lock<std::mutex> lock(m_);
		cv_.wait_for(lock, std::chrono::milliseconds(retryDelayMs(failures)), [this] { return stopping_ || retry_; });
		if (stopping_)
			return;
	}
}

bool Link::attempt()
{
	{
		std::lock_guard<std::mutex> lock(m_);
		retry_ = false; // a "Try again" that ended the wait is used up by this try
	}
	// TCG Bridge writes a fresh token every start, so the file is read again for every try.
	std::ifstream in(file_, std::ios::binary);
	if (!in)
		return false;
	std::stringstream buf;
	buf << in.rdbuf();
	auto link = parseLinkFile(buf.str());
	if (!link)
		return false;

	ix::WebSocket ws;
	ws.setUrl(std::string("ws://") + kHost + ":" + std::to_string(link->port));
	ws.disableAutomaticReconnection(); // the loop in run() decides when to try again, with a fresh token
	ws.setHandshakeTimeout(3);

	bool welcomed = false, ended = false;
	ws.setOnMessageCallback([&](const ix::WebSocketMessagePtr &msg) {
		if (msg->type == ix::WebSocketMessageType::Open) {
			ws.send(buildHello(link->token, version_));
		} else if (msg->type == ix::WebSocketMessageType::Message) {
			if (auto v = parseWelcome(msg->str)) {
				{
					std::lock_guard<std::mutex> lock(m_);
					welcomed = true;
				}
				cv_.notify_all();
				bool old = appTooOld(*v);
				{
					std::lock_guard<std::mutex> lock(sendM_);
					up_ = !old; // requests only go to an app the dock understands
				}
				set(old ? LinkState::NeedsUpdate : LinkState::Connected, *v);
			}
			if (onMessage_)
				onMessage_(msg->str);
		} else if (msg->type == ix::WebSocketMessageType::Close || msg->type == ix::WebSocketMessageType::Error) {
			{
				std::lock_guard<std::mutex> lock(m_);
				ended = true;
			}
			cv_.notify_all();
		}
	});
	{
		std::lock_guard<std::mutex> lock(sendM_);
		ws_ = &ws;
		up_ = false;
	}
	ws.start();

	{
		std::unique_lock<std::mutex> lock(m_);
		// Safety net: a connection that never says anything is given up after 15 seconds (the app itself closes one without a hello after 5).
		cv_.wait_for(lock, std::chrono::seconds(15), [&] { return stopping_ || ended || welcomed || retry_; });
		// Once welcomed, the link stays up until it drops or the dock goes.
		if (welcomed)
			cv_.wait(lock, [&] { return stopping_ || ended; });
	}
	{
		std::lock_guard<std::mutex> lock(sendM_);
		ws_ = nullptr; // no send can reach the socket from here on
		up_ = false;
	}
	ws.stop();
	std::lock_guard<std::mutex> lock(m_);
	return welcomed;
}

} // namespace tcg
