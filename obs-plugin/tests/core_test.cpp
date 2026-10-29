// Tests for src/core.h (run by ctest in CI). No framework: a failed CHECK prints its line and the exit code is 1.
#include "../src/core.h"

#include <cstdio>

static int failures = 0;
#define CHECK(cond)                                                              \
	do {                                                                     \
		if (!(cond)) {                                                   \
			std::fprintf(stderr, "FAIL line %d: %s\n", __LINE__, #cond); \
			failures++;                                                  \
		}                                                                \
	} while (0)

int main()
{
	using namespace tcg;

	// streamdeck.json as TCG Bridge writes it
	auto f = parseLinkFile("{\"port\":47654,\"token\":\"abc123\"}");
	CHECK(f && f->port == 47654 && f->token == "abc123");
	f = parseLinkFile("  {\n \"token\" : \"a\\\"b\\\\c\\u0041\", \"port\" : 47655 }\n");
	CHECK(f && f->port == 47655 && f->token == "a\"b\\cA");
	CHECK(!parseLinkFile(""));
	CHECK(!parseLinkFile("not json"));
	CHECK(!parseLinkFile("[]"));
	CHECK(!parseLinkFile("{\"port\":47654}"));
	CHECK(!parseLinkFile("{\"token\":\"x\"}"));
	CHECK(!parseLinkFile("{\"port\":\"47654\",\"token\":\"x\"}"));
	CHECK(!parseLinkFile("{\"port\":47654,\"token\":47}"));
	CHECK(!parseLinkFile("{\"port\":47654,\"token\":\"\"}"));
	CHECK(!parseLinkFile("{\"port\":80,\"token\":\"x\"}"));
	CHECK(!parseLinkFile("{\"port\":70000,\"token\":\"x\"}"));
	CHECK(!parseLinkFile("{\"port\":4765.5,\"token\":\"x\"}"));
	CHECK(!parseLinkFile("{\"port\":47654,\"token\":\"x\""));
	CHECK(!parseLinkFile("{\"port\":47654,\"token\":\"" + std::string(201, 'a') + "\"}"));
	CHECK(parseLinkFile("{\"port\":47654,\"token\":\"" + std::string(200, 'a') + "\"}"));

	// the hello the app expects first
	CHECK(buildHello("tok", "0.43.0") == "{\"t\":\"hello\",\"token\":\"tok\",\"protocol\":1,\"version\":\"0.43.0\"}");
	CHECK(buildHello("a\"b\\c\n", "1") == "{\"t\":\"hello\",\"token\":\"a\\\"b\\\\c\\u000a\",\"protocol\":1,\"version\":\"1\"}");
	// what the app sends back is read with the same parser, so a hello round trip returns the token
	auto back = parseObject(buildHello("a\"b\\c\n", "1"));
	CHECK(back && back->at("token").text == "a\"b\\c\n" && back->at("protocol").text == "1");

	// welcome: the version at the top, the state (nested, with its own "version" and strings with brackets) skipped
	auto w = parseWelcome("{\"t\":\"welcome\",\"version\":\"0.43.0\",\"state\":{\"ready\":true,\"version\":\"9.9.9\",\"feed\":[{\"text\":\"}]{\\\"\"}],\"queue\":[]}}");
	CHECK(w && *w == "0.43.0");
	CHECK(!parseWelcome("{\"t\":\"state\",\"state\":{}}"));
	CHECK(!parseWelcome("{\"t\":\"welcome\",\"state\":{}}"));
	CHECK(!parseWelcome("{\"t\":\"welcome\",\"version\":\"\",\"state\":{}}"));
	CHECK(!parseWelcome("{\"t\":\"welcome\",\"version\":\"0.43.0\",\"state\":{"));
	CHECK(!parseWelcome("garbage"));

	// versions
	CHECK(parseVersion("0.43.0") && parseVersion("0.43.0")->minor == 43);
	CHECK(parseVersion("1.2.3-beta") && parseVersion("1.2.3-beta")->patch == 3);
	CHECK(!parseVersion("1.2"));
	CHECK(!parseVersion("1.2.3.0"));
	CHECK(!parseVersion("a.b.c"));
	CHECK(!parseVersion(""));
	CHECK(appTooOld("0.42.9"));
	CHECK(appTooOld("0.14.0"));
	CHECK(!appTooOld("0.43.0"));
	CHECK(!appTooOld("0.44.0"));
	CHECK(!appTooOld("1.0.0"));
	CHECK(!appTooOld("0.43.1"));
	CHECK(appTooOld("nonsense"));
	CHECK(appTooOld(""));

	// backoff: a few seconds, growing a little, never more than 8 s, and never shrinking
	CHECK(retryDelayMs(0) == 2000);
	CHECK(retryDelayMs(1) == 3000);
	CHECK(retryDelayMs(100) == 8000);
	CHECK(retryDelayMs(-5) == 2000);
	for (int n = 0; n < 20; n++)
		CHECK(retryDelayMs(n + 1) >= retryDelayMs(n));

	// requests the dock sends, as the app's parseRequest reads them
	CHECK(buildDo(7, reqPause()) == "{\"t\":\"do\",\"n\":7,\"req\":{\"what\":\"pause\"}}");
	CHECK(reqPauseAwards(true) == "{\"what\":\"pause-awards\",\"on\":true}");
	CHECK(reqPauseAwards(false) == "{\"what\":\"pause-awards\",\"on\":false}");
	CHECK(reqHappyStart(15, false, 50) == "{\"what\":\"happy-start\",\"minutes\":15,\"kind\":\"free\",\"percent\":0}");
	CHECK(reqHappyStart(30, true, 50) == "{\"what\":\"happy-start\",\"minutes\":30,\"kind\":\"discount\",\"percent\":50}");
	CHECK(reqHappyEnd() == "{\"what\":\"happy-end\"}" && reqSkip() == "{\"what\":\"skip\"}" && reqClearQueue() == "{\"what\":\"clear-queue\"}");
	auto d = parseObject(buildDo(12, reqSkip()));
	CHECK(d && d->at("t").text == "do" && d->at("n").text == "12" && d->count("req") == 0); // req is an object, skipped by the flat parser

	// minutes left: rounded up, never negative
	CHECK(minutesLeft(0, 1000) == 0);
	CHECK(minutesLeft(1000, 1000) == 0);
	CHECK(minutesLeft(1001, 1000) == 1);
	CHECK(minutesLeft(61000, 1000) == 1);
	CHECK(minutesLeft(61001, 1000) == 2);
	CHECK(minutesLeft(1000LL + 29 * 60000LL + 1, 1000) == 30);
	CHECK(minutesLeft(9000000000000000LL, 0) == 100000);

	// queue row, right side
	CHECK(waitingText(0, true) == "showing" && waitingText(99, true) == "showing");
	CHECK(waitingText(12, false) == "12s" && waitingText(-3, false) == "0s");

	// feed chips
	CHECK(feedShows(FeedFilter::All, "pulls") && feedShows(FeedFilter::All, "anything"));
	CHECK(feedShows(FeedFilter::Pulls, "pulls") && !feedShows(FeedFilter::Pulls, "events"));
	CHECK(feedShows(FeedFilter::Requests, "requests") && !feedShows(FeedFilter::Requests, "problems"));
	CHECK(feedShows(FeedFilter::Events, "events") && !feedShows(FeedFilter::Events, "pulls"));
	CHECK(feedShows(FeedFilter::Problems, "problems") && !feedShows(FeedFilter::Problems, "requests") && !feedShows(FeedFilter::Problems, ""));

	if (failures) {
		std::fprintf(stderr, "%d check(s) failed\n", failures);
		return 1;
	}
	std::printf("core_test: all checks passed\n");
	return 0;
}
