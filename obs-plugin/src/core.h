// The pure parts of the TCG dock's link to TCG Bridge (ROADMAP 62.3): no OBS, no Qt, no sockets, so tests/core_test.cpp can run them anywhere.
// They mirror bridge/src/deckprotocol.ts (the Stream Deck link, 62.2): streamdeck.json = { port, token }, hello first, welcome carries the app version.
#pragma once

#include <cstdlib>
#include <map>
#include <optional>
#include <string>

namespace tcg {

constexpr int kProtocol = 1;               // PROTOCOL in deckprotocol.ts
constexpr const char *kHost = "127.0.0.1"; // DECK_HOST: the link is on this PC only
constexpr const char *kMinApp = "0.43.0";  // the first TCG Bridge with the dock additions (62.2)

struct LinkFile {
	int port = 0;
	std::string token;
};

// One top-level member of a JSON object: a string (unescaped) or a number, true, false, null (as written). Objects and arrays are skipped.
struct JsonField {
	bool isString = false;
	std::string text;
};
using JsonFields = std::map<std::string, JsonField>;

namespace detail {
struct Scan {
	const std::string &s;
	size_t i = 0;
	void space()
	{
		while (i < s.size() && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r'))
			i++;
	}
	bool eat(char c)
	{
		space();
		if (i < s.size() && s[i] == c) {
			i++;
			return true;
		}
		return false;
	}
	static void utf8(std::string &out, unsigned c)
	{
		if (c < 0x80) {
			out += (char)c;
		} else if (c < 0x800) {
			out += (char)(0xC0 | (c >> 6));
			out += (char)(0x80 | (c & 0x3F));
		} else {
			out += (char)(0xE0 | (c >> 12));
			out += (char)(0x80 | ((c >> 6) & 0x3F));
			out += (char)(0x80 | (c & 0x3F));
		}
	}
	// A string starting at the opening quote; false on anything malformed. shortcut: a \u surrogate pair is not joined, the token is plain ASCII.
	bool str(std::string &out)
	{
		if (i >= s.size() || s[i] != '"')
			return false;
		i++;
		while (i < s.size()) {
			char c = s[i++];
			if (c == '"')
				return true;
			if (c != '\\') {
				out += c;
				continue;
			}
			if (i >= s.size())
				return false;
			char e = s[i++];
			switch (e) {
			case '"':
			case '\\':
			case '/':
				out += e;
				break;
			case 'b': out += '\b'; break;
			case 'f': out += '\f'; break;
			case 'n': out += '\n'; break;
			case 'r': out += '\r'; break;
			case 't': out += '\t'; break;
			case 'u': {
				if (i + 4 > s.size())
					return false;
				unsigned v = 0;
				for (int k = 0; k < 4; k++) {
					char h = s[i++];
					v <<= 4;
					if (h >= '0' && h <= '9')
						v |= (unsigned)(h - '0');
					else if (h >= 'a' && h <= 'f')
						v |= (unsigned)(h - 'a' + 10);
					else if (h >= 'A' && h <= 'F')
						v |= (unsigned)(h - 'A' + 10);
					else
						return false;
				}
				utf8(out, v);
				break;
			}
			default:
				return false;
			}
		}
		return false;
	}
	// Skips an object or array (the opening bracket is at i), strings included. No recursion, so a deep message cannot overflow the stack.
	bool skipNested()
	{
		int depth = 0;
		while (i < s.size()) {
			char c = s[i];
			if (c == '"') {
				std::string ignore;
				if (!str(ignore))
					return false;
				continue;
			}
			i++;
			if (c == '{' || c == '[')
				depth++;
			else if (c == '}' || c == ']') {
				if (--depth == 0)
					return true;
			}
		}
		return false;
	}
};
} // namespace detail

// The top-level members of a JSON object, or nullopt when it is not one (or is longer than 1 MiB). Bare words are kept as written, not checked.
inline std::optional<JsonFields> parseObject(const std::string &raw)
{
	if (raw.size() > (1u << 20))
		return std::nullopt;
	detail::Scan p{raw};
	JsonFields out;
	if (!p.eat('{'))
		return std::nullopt;
	if (p.eat('}'))
		return out;
	for (;;) {
		p.space();
		std::string key;
		if (!p.str(key) || !p.eat(':'))
			return std::nullopt;
		p.space();
		if (p.i >= raw.size())
			return std::nullopt;
		JsonField f;
		bool keep = true;
		if (raw[p.i] == '"') {
			f.isString = true;
			if (!p.str(f.text))
				return std::nullopt;
		} else if (raw[p.i] == '{' || raw[p.i] == '[') {
			if (!p.skipNested())
				return std::nullopt;
			keep = false;
		} else {
			size_t start = p.i;
			while (p.i < raw.size() && raw[p.i] != ',' && raw[p.i] != '}' && raw[p.i] != ' ' && raw[p.i] != '\n' && raw[p.i] != '\r' &&
			       raw[p.i] != '\t')
				p.i++;
			f.text = raw.substr(start, p.i - start);
			if (f.text.empty())
				return std::nullopt;
		}
		if (keep)
			out[key] = f;
		if (p.eat(','))
			continue;
		if (p.eat('}'))
			return out;
		return std::nullopt;
	}
}

// streamdeck.json: a port (1024 to 65535, an integer) and a non-empty token of at most 200 characters, or nullopt (the rules of parseLinkFile in deckprotocol.ts).
inline std::optional<LinkFile> parseLinkFile(const std::string &raw)
{
	auto o = parseObject(raw);
	if (!o)
		return std::nullopt;
	auto port = o->find("port");
	auto token = o->find("token");
	if (port == o->end() || token == o->end() || port->second.isString || !token->second.isString)
		return std::nullopt;
	const std::string &digits = port->second.text;
	if (digits.empty() || digits.size() > 5 || digits.find_first_not_of("0123456789") != std::string::npos)
		return std::nullopt;
	int n = std::atoi(digits.c_str());
	if (n < 1024 || n > 65535 || token->second.text.empty() || token->second.text.size() > 200)
		return std::nullopt;
	return LinkFile{n, token->second.text};
}

inline std::string jsonString(const std::string &v)
{
	static const char *hex = "0123456789abcdef";
	std::string out = "\"";
	for (unsigned char c : v) {
		if (c == '"' || c == '\\') {
			out += '\\';
			out += (char)c;
		} else if (c < 0x20) {
			out += "\\u00";
			out += hex[c >> 4];
			out += hex[c & 15];
		} else {
			out += (char)c;
		}
	}
	return out + "\"";
}

// The first message the client sends; anything else first and the app closes the link (ClientMessage in deckprotocol.ts).
inline std::string buildHello(const std::string &token, const std::string &pluginVersion)
{
	return "{\"t\":\"hello\",\"token\":" + jsonString(token) + ",\"protocol\":" + std::to_string(kProtocol) + ",\"version\":" + jsonString(pluginVersion) + "}";
}

// The app's version from its welcome message, or nullopt for any other message. The state inside is not read here (62.4 does that).
inline std::optional<std::string> parseWelcome(const std::string &raw)
{
	auto o = parseObject(raw);
	if (!o)
		return std::nullopt;
	auto t = o->find("t");
	auto v = o->find("version");
	if (t == o->end() || !t->second.isString || t->second.text != "welcome" || v == o->end() || !v->second.isString || v->second.text.empty() ||
	    v->second.text.size() > 40)
		return std::nullopt;
	return v->second.text;
}

struct Version {
	int major = 0, minor = 0, patch = 0;
};

// "0.43.0" (a "-suffix" is ignored), or nullopt for anything else.
inline std::optional<Version> parseVersion(const std::string &s)
{
	Version v;
	int *part[3] = {&v.major, &v.minor, &v.patch};
	size_t i = 0;
	for (int k = 0; k < 3; k++) {
		size_t start = i;
		long n = 0;
		while (i < s.size() && s[i] >= '0' && s[i] <= '9' && i - start < 6)
			n = n * 10 + (s[i++] - '0');
		if (i == start)
			return std::nullopt;
		*part[k] = (int)n;
		if (k < 2) {
			if (i >= s.size() || s[i] != '.')
				return std::nullopt;
			i++;
		}
	}
	if (i < s.size() && s[i] != '-')
		return std::nullopt;
	return v;
}

// True when the app is older than the dock needs (62.2's additions arrived in 0.43.0). An unreadable version counts as too old.
inline bool appTooOld(const std::string &appVersion, const std::string &min = kMinApp)
{
	auto a = parseVersion(appVersion);
	auto m = parseVersion(min);
	if (!a || !m)
		return true;
	if (a->major != m->major)
		return a->major < m->major;
	if (a->minor != m->minor)
		return a->minor < m->minor;
	return a->patch < m->patch;
}

// How long to wait before the next try after `failures` tries in a row that got no welcome (0 = the link was up and dropped).
inline int retryDelayMs(int failures)
{
	static const int steps[] = {2000, 3000, 5000, 5000, 8000};
	if (failures < 0)
		failures = 0;
	if (failures > 4)
		failures = 4;
	return steps[failures];
}

} // namespace tcg
