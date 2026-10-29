// The TCG dock (ROADMAP 62.3, 62.4): a header with the connection, one of three bodies (not running, the controls, update TCG Bridge) and the plugin version.
// The link runs on its own thread; its changes and messages come to this thread as queued calls, and widgets are only touched here. The controls send
// requests through Link::send (bodies in core.h) and wait for the app's {t:'done'} and the next state before they work again.
// Every colour comes from stylesheets set on the dock's own widgets (#tcgDock and the buttons), so OBS's other docks are untouched.
#include "dock.h"
#include "core.h"
#include "link.h"

#include <QButtonGroup>
#include <QDateTime>
#include <QHBoxLayout>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLabel>
#include <QList>
#include <QMessageBox>
#include <QPushButton>
#include <QScrollArea>
#include <QScrollBar>
#include <QStackedWidget>
#include <QTextBrowser>
#include <QTimer>
#include <QVBoxLayout>

#include <memory>

namespace {

const char *kGreen = "#3fb950", *kRed = "#f85149", *kAmber = "#d29922", *kMuted = "color: #9a9caa;";

enum Tone { Neutral = 0, Good = 1, Warn = 2, Bad = 3 };

// Background, border and text of a button (the mockup's colours).
QString buttonStyle(int tone)
{
	QString bg = "#33353e", border = "#4a4d58", fg = "#e4e5ea";
	if (tone == Good) {
		bg = "#1f3a2d";
		border = "#3f6b54";
		fg = "#bbf7d0";
	} else if (tone == Warn) {
		bg = "#3b2e12";
		border = "#7c5c1a";
		fg = "#fde68a";
	} else if (tone == Bad) {
		bg = "#3a2222";
		border = "#6b3a3a";
		fg = "#fecaca";
	}
	return QString("QPushButton { background: %1; border: 1px solid %2; border-radius: 4px; color: %3; padding: 4px 10px; }"
		       "QPushButton:hover { border-color: #7a7d88; }"
		       "QPushButton:focus { border: 2px solid #e4e5ea; }"
		       "QPushButton:checked { background: #4a4d58; border-color: #9a9caa; color: #ffffff; }"
		       "QPushButton:disabled { background: #2a2b31; border-color: #3a3d47; color: #6b6d7a; }")
		.arg(bg, border, fg);
}

void setTone(QPushButton *b, int tone)
{
	QVariant v = b->property("tone");
	if (v.isValid() && v.toInt() == tone)
		return;
	b->setProperty("tone", tone);
	b->setStyleSheet(buttonStyle(tone));
}

QLabel *text(const QString &s, const char *style = nullptr)
{
	auto *l = new QLabel(s);
	l->setWordWrap(true);
	if (style)
		l->setStyleSheet(style);
	return l;
}

QPushButton *makeButton(const QString &label, const QString &accessibleName, int tone = Neutral, int minHeight = 36)
{
	auto *b = new QPushButton(label);
	b->setAccessibleName(accessibleName);
	b->setMinimumHeight(minHeight);
	setTone(b, tone);
	return b;
}

// A section heading in small caps (typed in capitals).
QLabel *heading(const QString &s)
{
	auto *l = new QLabel(s);
	QFont f = l->font();
	f.setBold(true);
	f.setPointSizeF(f.pointSizeF() > 0 ? f.pointSizeF() * 0.85 : 8.0);
	f.setLetterSpacing(QFont::AbsoluteSpacing, 1.0);
	l->setFont(f);
	l->setStyleSheet(kMuted);
	return l;
}

// The Pulls and Awards buttons: a main line and a small line under it, one accessible name for both.
class TwoLine : public QPushButton {
public:
	TwoLine()
	{
		auto *v = new QVBoxLayout(this);
		v->setContentsMargins(6, 3, 6, 3);
		v->setSpacing(0);
		main_ = new QLabel;
		sub_ = new QLabel;
		for (QLabel *l : {main_, sub_}) {
			l->setAlignment(Qt::AlignCenter);
			l->setAttribute(Qt::WA_TransparentForMouseEvents);
			v->addWidget(l);
		}
		setMinimumHeight(44);
	}
	void set(const QString &mainText, const QString &subText, int tone)
	{
		QString fg = tone == Good ? "#bbf7d0" : tone == Warn ? "#fde68a" : "#e4e5ea";
		main_->setText(mainText);
		sub_->setText(subText);
		main_->setStyleSheet(QString("color: %1; font-weight: 600; background: transparent;").arg(fg));
		sub_->setStyleSheet(QString("color: %1; font-size: 10px; background: transparent;").arg(fg));
		setAccessibleName(mainText + ". " + subText);
		setTone(this, tone);
	}

private:
	QLabel *main_, *sub_;
};

QWidget *page(QLabel *title, const QList<QLabel *> &lines, QPushButton *action)
{
	auto *w = new QWidget;
	auto *v = new QVBoxLayout(w);
	v->setContentsMargins(12, 10, 12, 0);
	v->setSpacing(8);
	QFont f = title->font();
	f.setBold(true);
	title->setFont(f);
	v->addWidget(title);
	for (auto *l : lines)
		v->addWidget(l);
	if (action) {
		auto *row = new QHBoxLayout;
		row->addWidget(action);
		row->addStretch();
		v->addLayout(row);
	}
	v->addStretch();
	return w;
}

// What the controls show, read from a state message (DeckState in deckprotocol.ts). Anything missing or of the wrong type gets the old-app default.
struct Row {
	QString viewer, what;
	int waitingSec = 0;
	bool showing = false;
};
struct Line {
	qint64 at = 0;
	std::string kind;
	QString text;
};
struct Snap {
	int paused = -1; // -1 = the site has not said yet
	int awardsPaused = -1;
	QString reason;
	bool hasHappy = false;
	QString happyWhat;
	qint64 happyEnds = 0;
	bool live = false;
	QList<Row> queue;
	QList<Line> feed;
};

int tri(const QJsonValue &v)
{
	return v.isBool() ? (v.toBool() ? 1 : 0) : -1;
}

Snap parseSnap(const QJsonObject &o)
{
	Snap s;
	s.paused = tri(o["paused"]);
	s.awardsPaused = tri(o["awardsPaused"]);
	s.reason = o["reason"].toString();
	s.live = o["live"].toBool(false);
	QJsonObject h = o["happy"].toObject();
	if (o["happy"].isObject() && h["what"].isString() && h["endsAt"].isDouble()) {
		s.hasHappy = true;
		s.happyWhat = h["what"].toString();
		s.happyEnds = (qint64)h["endsAt"].toDouble();
	}
	for (const QJsonValue &v : o["queue"].toArray()) {
		QJsonObject q = v.toObject();
		if (s.queue.size() >= 10 || !q["viewer"].isString() || !q["what"].isString())
			continue;
		Row r;
		r.viewer = q["viewer"].toString();
		r.what = q["what"].toString();
		r.waitingSec = q["waitingSec"].toInt(0);
		r.showing = q["showing"].toBool(false);
		s.queue.append(r);
	}
	for (const QJsonValue &v : o["feed"].toArray()) {
		QJsonObject f = v.toObject();
		if (s.feed.size() >= 30 || !f["kind"].isString() || !f["text"].isString())
			continue;
		Line l;
		l.at = (qint64)f["at"].toDouble();
		l.kind = f["kind"].toString().toStdString();
		l.text = f["text"].toString();
		s.feed.append(l);
	}
	return s;
}

class Dock : public QWidget {
public:
	Dock()
	{
		setObjectName("tcgDock");
		setAttribute(Qt::WA_StyledBackground, true);
		setStyleSheet("#tcgDock { background: #1e1f24; } #tcgDock QLabel { color: #e4e5ea; } #tcgHeader { background: #2a2c33; border-bottom: 1px solid #3a3d47; }");

		auto *root = new QVBoxLayout(this);
		root->setContentsMargins(0, 0, 0, 8);
		root->setSpacing(0);

		auto *header = new QWidget;
		header->setObjectName("tcgHeader");
		auto *head = new QHBoxLayout(header);
		head->setContentsMargins(12, 8, 12, 8);
		auto *name = new QLabel("TCG");
		QFont nf = name->font();
		nf.setBold(true);
		name->setFont(nf);
		head->addWidget(name);
		head->addStretch();
		dot_ = new QLabel(QString::fromUtf8("\xE2\x97\x8F")); // a filled circle; the words next to it say the same, so the colour is not the only signal
		status_ = new QLabel;
		head->addWidget(dot_);
		head->addWidget(status_);
		root->addWidget(header);

		auto *retry = makeButton(QObject::tr("Try again"), QObject::tr("Try again"), Neutral, 44);
		QObject::connect(retry, &QPushButton::clicked, this, [this] { link_->retryNow(); });

		updateText_ = text("");
		stack_ = new QStackedWidget;
		stack_->addWidget(page(text(QObject::tr("The dock needs TCG Bridge")),
				       {text(QObject::tr("Open TCG Bridge on this PC. The dock connects by itself as soon as it starts; nothing needs typing.")),
					text(QObject::tr("Pulls, the queue and the overlay keep working on the site while the dock is down. Only these buttons wait."), kMuted)},
				       retry));
		stack_->addWidget(buildControls());
		stack_->addWidget(page(text(QObject::tr("Update TCG Bridge")), {updateText_}, nullptr));
		root->addWidget(stack_, 1);

		auto *foot = text(QString("Plugin %1").arg(QString::fromLatin1(TCG_PLUGIN_VERSION)), kMuted);
		foot->setContentsMargins(12, 6, 12, 0);
		root->addWidget(foot);

		busyTimer_ = new QTimer(this);
		busyTimer_->setSingleShot(true);
		QObject::connect(busyTimer_, &QTimer::timeout, this, [this] { endBusy(); });
		tick_ = new QTimer(this); // the minutes left of a happy hour
		tick_->setInterval(30000);
		QObject::connect(tick_, &QTimer::timeout, this, [this] { renderHappy(); });
		tick_->start();

		apply(tcg::LinkState::Down, "");

		link_ = std::make_unique<tcg::Link>(
			tcg::defaultLinkFile(), TCG_PLUGIN_VERSION,
			[this](tcg::LinkState s, std::string v) {
				// Called on the link's thread: hop to this one. If the dock is gone by then, Qt drops the call.
				QMetaObject::invokeMethod(this, [this, s, v] { apply(s, v); }, Qt::QueuedConnection);
			},
			[this](const std::string &raw) {
				if (raw.size() > 65536) // the app never sends more (parseServer)
					return;
				QByteArray bytes(raw.data(), (qsizetype)raw.size());
				QMetaObject::invokeMethod(this, [this, bytes] { onMessage(bytes); }, Qt::QueuedConnection);
			});
		link_->start();
	}

	~Dock() override { link_.reset(); } // joins the link's thread before the widgets go

private:
	QWidget *buildControls()
	{
		// Created top to bottom, so Tab goes the same way.
		auto *inner = new QWidget;
		auto *v = new QVBoxLayout(inner);
		v->setContentsMargins(12, 10, 12, 4);
		v->setSpacing(6);

		v->addWidget(heading(QObject::tr("PULLS")));
		auto *pr = new QHBoxLayout;
		pulls_ = new TwoLine;
		awards_ = new TwoLine;
		pr->addWidget(pulls_, 1);
		pr->addWidget(awards_, 1);
		v->addLayout(pr);
		reason_ = text("", kMuted);
		reason_->hide();
		v->addWidget(reason_);
		err_ = text("", "color: #fca5a5;");
		err_->hide();
		v->addWidget(err_);
		QObject::connect(pulls_, &QPushButton::clicked, this, [this] { ask(tcg::reqPause()); });
		QObject::connect(awards_, &QPushButton::clicked, this, [this] { ask(tcg::reqPauseAwards(s_.awardsPaused != 1)); }); // an explicit target

		v->addSpacing(6);
		v->addWidget(heading(QObject::tr("HAPPY HOUR")));
		happyRow_ = new QWidget;
		auto *hr = new QHBoxLayout(happyRow_);
		hr->setContentsMargins(0, 0, 0, 0);
		happyText_ = new QLabel;
		happyText_->setTextFormat(Qt::RichText);
		hr->addWidget(happyText_, 1);
		end_ = makeButton(QObject::tr("End"), QObject::tr("End happy hour"));
		hr->addWidget(end_);
		happyRow_->hide();
		v->addWidget(happyRow_);
		QObject::connect(end_, &QPushButton::clicked, this, [this] { ask(tcg::reqHappyEnd()); });
		auto *presets = new QHBoxLayout;
		struct Preset {
			const char *label, *name;
			int minutes;
			bool discount;
		};
		const Preset list[] = {{"Free 15 min", "Start a free happy hour for 15 minutes", 15, false},
				       {"Free 30 min", "Start a free happy hour for 30 minutes", 30, false},
				       {"50% off 30 min", "Start a 50 percent off happy hour for 30 minutes", 30, true}};
		for (const Preset &p : list) {
			auto *b = makeButton(QObject::tr(p.label), QObject::tr(p.name));
			presets->addWidget(b, 1);
			presetButtons_.append(b);
			int minutes = p.minutes;
			bool discount = p.discount;
			QObject::connect(b, &QPushButton::clicked, this, [this, minutes, discount] { ask(tcg::reqHappyStart(minutes, discount, 50)); });
		}
		v->addLayout(presets);

		v->addSpacing(6);
		auto *qh = new QHBoxLayout;
		queueHead_ = heading(QObject::tr("QUEUE (0)"));
		qh->addWidget(queueHead_, 1);
		skip_ = makeButton(QObject::tr("Skip"), QObject::tr("Skip the pull on screen"), Neutral, 30);
		clear_ = makeButton(QObject::tr("Clear"), QObject::tr("Clear the queue"), Bad, 30);
		qh->addWidget(skip_);
		qh->addWidget(clear_);
		v->addLayout(qh);
		QObject::connect(skip_, &QPushButton::clicked, this, [this] { ask(tcg::reqSkip()); });
		QObject::connect(clear_, &QPushButton::clicked, this, [this] {
			if (QMessageBox::question(this, QObject::tr("Clear the queue"), QObject::tr("Clear the whole queue?"), QMessageBox::Yes | QMessageBox::No,
						  QMessageBox::No) == QMessageBox::Yes)
				ask(tcg::reqClearQueue());
		});
		rows_ = new QVBoxLayout;
		rows_->setSpacing(3);
		v->addLayout(rows_);

		v->addSpacing(6);
		v->addWidget(heading(QObject::tr("FEED")));
		auto *chips = new QHBoxLayout;
		chips->setSpacing(4);
		auto *group = new QButtonGroup(this);
		group->setExclusive(true);
		const char *names[] = {"All", "Pulls", "Requests", "Events", "Problems"};
		for (int i = 0; i < 5; i++) {
			auto *c = makeButton(QObject::tr(names[i]), QObject::tr("Feed filter: %1").arg(QObject::tr(names[i])), Neutral, 28);
			c->setCheckable(true);
			c->setChecked(i == 0);
			group->addButton(c, i);
			chips->addWidget(c);
		}
		chips->addStretch();
		v->addLayout(chips);
		QObject::connect(group, &QButtonGroup::idClicked, this, [this](int id) {
			filter_ = (tcg::FeedFilter)id;
			renderFeed();
		});
		feed_ = new QTextBrowser;
		feed_->setOpenLinks(false);
		feed_->setAccessibleName(QObject::tr("Live feed"));
		feed_->setMinimumHeight(90);
		feed_->setStyleSheet("QTextBrowser { background: #1e1f24; border: 1px solid #3a3d47; color: #e4e5ea; } QTextBrowser:focus { border: 2px solid #e4e5ea; }");
		v->addWidget(feed_, 1);

		auto *scroll = new QScrollArea;
		scroll->setFrameShape(QFrame::NoFrame);
		scroll->setWidgetResizable(true);
		scroll->setWidget(inner);
		scroll->viewport()->setAutoFillBackground(false); // the dock's own background shows through
		inner->setAutoFillBackground(false);
		return scroll;
	}

	void apply(tcg::LinkState s, const std::string &appVersion)
	{
		state_ = s;
		connected_ = s == tcg::LinkState::Connected;
		if (!connected_) {
			s_ = Snap();
			busy_ = false;
			doneSeen_ = false;
			pending_ = 0;
			busyTimer_->stop();
			err_->hide();
		}
		int index = connected_ ? 1 : s == tcg::LinkState::NeedsUpdate ? 2 : 0;
		if (s == tcg::LinkState::NeedsUpdate)
			updateText_->setText(QObject::tr("The dock needs TCG Bridge %1 or newer, and this PC runs %2. Update TCG Bridge (About, Check for updates); the dock connects by itself afterwards.")
						     .arg(QString::fromLatin1(tcg::kMinApp), QString::fromStdString(appVersion)));
		stack_->setCurrentIndex(index);
		renderHeader();
		renderAll();
	}

	void renderHeader()
	{
		const char *colour = kRed;
		QString words = QObject::tr("TCG Bridge not running");
		if (connected_) {
			colour = kGreen;
			words = (s_.live ? QObject::tr("Live") : QObject::tr("Offline")) + QString::fromUtf8(" \xC2\xB7 ") + QObject::tr("TCG Bridge connected");
		} else if (state_ == tcg::LinkState::NeedsUpdate) {
			colour = kAmber;
			words = QObject::tr("TCG Bridge needs an update");
		}
		dot_->setStyleSheet(QString("color: %1;").arg(QString::fromLatin1(colour)));
		status_->setText(words);
	}

	// A message from the app: the state (the welcome carries one too) or the answer to a request.
	void onMessage(const QByteArray &bytes)
	{
		if (!connected_)
			return;
		QJsonParseError err;
		QJsonDocument doc = QJsonDocument::fromJson(bytes, &err);
		if (err.error != QJsonParseError::NoError || !doc.isObject())
			return;
		QJsonObject o = doc.object();
		QString t = o["t"].toString();
		if ((t == "welcome" || t == "state") && o["state"].isObject()) {
			s_ = parseSnap(o["state"].toObject());
			if (busy_ && doneSeen_)
				endBusy(); // the answer came and so did the state that follows it
			renderHeader();
			renderAll();
		} else if (t == "done") {
			bool ok = o["ok"].toBool(false);
			if (!ok) {
				QString why = o["text"].toString();
				showError(why.isEmpty() ? QObject::tr("That did not work") : why);
			}
			if (o["n"].toInt(-1) == pending_) {
				if (ok) {
					doneSeen_ = true;
					busyTimer_->start(800); // normally the new state arrives first; if it is the same as before, this ends the wait
				} else {
					endBusy();
				}
			}
		}
	}

	void showError(const QString &s)
	{
		err_->setText(s);
		err_->setAccessibleName(QObject::tr("Error: %1").arg(s));
		err_->show();
	}

	// One request at a time: the buttons stay disabled until the app answers and sends its state (or a few seconds pass).
	void ask(const std::string &req)
	{
		if (busy_ || !connected_)
			return;
		int n = link_->send(req);
		if (!n) {
			showError(QObject::tr("TCG Bridge is not answering"));
			return;
		}
		err_->hide();
		pending_ = n;
		busy_ = true;
		doneSeen_ = false;
		busyTimer_->start(3000);
		renderButtons();
	}

	void endBusy()
	{
		busy_ = false;
		doneSeen_ = false;
		pending_ = 0;
		busyTimer_->stop();
		renderButtons();
	}

	void renderAll()
	{
		renderButtons();
		renderHappy();
		renderQueue();
		renderFeed();
	}

	void renderButtons()
	{
		bool idle = connected_ && !busy_;
		if (s_.paused < 0)
			pulls_->set(QObject::tr("Pulls"), QObject::tr("Waiting for the site"), Neutral);
		else if (s_.paused == 0)
			pulls_->set(QObject::tr("Pulls on"), QObject::tr("Press to pause"), Good);
		else
			pulls_->set(QObject::tr("Pulls paused"), QObject::tr("Press to resume"), Warn);
		pulls_->setEnabled(idle && s_.paused >= 0);
		if (s_.awardsPaused < 0)
			awards_->set(QObject::tr("Awards"), QObject::tr("Waiting for the site"), Neutral);
		else if (s_.awardsPaused == 0)
			awards_->set(QObject::tr("Awards on"), QObject::tr("Press to pause"), Good);
		else
			awards_->set(QObject::tr("Awards paused"), QObject::tr("Press to resume"), Warn);
		awards_->setEnabled(idle && s_.awardsPaused >= 0);
		reason_->setText(s_.reason);
		reason_->setVisible(!s_.reason.isEmpty());
		end_->setEnabled(idle);
		for (QPushButton *b : presetButtons_)
			b->setEnabled(idle);
		skip_->setEnabled(idle);
		clear_->setEnabled(idle);
	}

	void renderHappy()
	{
		happyRow_->setVisible(s_.hasHappy);
		if (!s_.hasHappy)
			return;
		int min = tcg::minutesLeft(s_.happyEnds, QDateTime::currentMSecsSinceEpoch());
		QString left = QObject::tr("%1 min left").arg(min);
		happyText_->setText(QString("<span style=\"color:#facc15\">%1</span> \xC2\xB7 %2").arg(s_.happyWhat.toHtmlEscaped(), left.toHtmlEscaped()));
		happyText_->setAccessibleName(QObject::tr("Happy hour: %1, %2").arg(s_.happyWhat, left));
	}

	void renderQueue()
	{
		queueHead_->setText(QObject::tr("QUEUE (%1)").arg(s_.queue.size()));
		while (QLayoutItem *it = rows_->takeAt(0)) {
			delete it->widget();
			delete it;
		}
		if (s_.queue.isEmpty()) {
			rows_->addWidget(text(QObject::tr("Nothing waiting"), kMuted));
			return;
		}
		for (const Row &r : s_.queue) {
			auto *w = new QWidget;
			auto *h = new QHBoxLayout(w);
			h->setContentsMargins(0, 0, 0, 0);
			auto *left = new QLabel(QString("<b>%1</b> \xC2\xB7 %2").arg(r.viewer.toHtmlEscaped(), r.what.toHtmlEscaped()));
			left->setTextFormat(Qt::RichText);
			left->setWordWrap(true);
			auto *right = new QLabel(QString::fromStdString(tcg::waitingText(r.waitingSec, r.showing)));
			right->setStyleSheet(kMuted);
			h->addWidget(left, 1);
			h->addWidget(right);
			w->setAccessibleName(QString("%1, %2, %3").arg(r.viewer, r.what, right->text()));
			rows_->addWidget(w);
		}
	}

	void renderFeed()
	{
		QString html;
		for (const Line &l : s_.feed) {
			if (!tcg::feedShows(filter_, l.kind))
				continue;
			QString colour = l.kind == "problems" ? "#fca5a5" : "#e4e5ea";
			html += QString("<p style=\"margin:0 0 3px 0\"><span style=\"color:#9a9caa\">%1</span>&nbsp; <span style=\"color:%2\">%3</span></p>")
					.arg(QDateTime::fromMSecsSinceEpoch(l.at).toString("HH:mm"), colour, l.text.toHtmlEscaped());
		}
		if (html.isEmpty())
			html = QString("<p style=\"color:#9a9caa\">%1</p>").arg(QObject::tr("Nothing yet").toHtmlEscaped());
		int scroll = feed_->verticalScrollBar()->value();
		feed_->setHtml(html);
		feed_->verticalScrollBar()->setValue(scroll);
	}

	QLabel *dot_, *status_, *updateText_;
	QStackedWidget *stack_;
	TwoLine *pulls_ = nullptr, *awards_ = nullptr;
	QLabel *reason_ = nullptr, *err_ = nullptr, *happyText_ = nullptr, *queueHead_ = nullptr;
	QWidget *happyRow_ = nullptr;
	QPushButton *end_ = nullptr, *skip_ = nullptr, *clear_ = nullptr;
	QList<QPushButton *> presetButtons_;
	QVBoxLayout *rows_ = nullptr;
	QTextBrowser *feed_ = nullptr;
	QTimer *busyTimer_ = nullptr, *tick_ = nullptr;

	Snap s_;
	tcg::LinkState state_ = tcg::LinkState::Down;
	tcg::FeedFilter filter_ = tcg::FeedFilter::All;
	bool connected_ = false, busy_ = false, doneSeen_ = false;
	int pending_ = 0;
	std::unique_ptr<tcg::Link> link_;
};

} // namespace

QWidget *tcg::createDock()
{
	return new Dock;
}
