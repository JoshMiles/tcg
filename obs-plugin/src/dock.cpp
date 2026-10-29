// The TCG dock (ROADMAP 62.3): a header with the connection, one of three bodies (not running, connected, update TCG Bridge) and the plugin version.
// The link runs on its own thread; its changes come to this thread as queued calls. 62.4 builds the real controls.
#include "dock.h"
#include "core.h"
#include "link.h"

#include <QHBoxLayout>
#include <QLabel>
#include <QList>
#include <QPushButton>
#include <QStackedWidget>
#include <QVBoxLayout>

#include <memory>

namespace {

const char *kGreen = "#3fb950", *kRed = "#f85149", *kAmber = "#d29922", *kMuted = "color: #8b949e;";

QLabel *text(const QString &s, const char *style = nullptr)
{
	auto *l = new QLabel(s);
	l->setWordWrap(true);
	if (style)
		l->setStyleSheet(style);
	return l;
}

QWidget *page(QLabel *title, const QList<QLabel *> &lines, QPushButton *button)
{
	auto *w = new QWidget;
	auto *v = new QVBoxLayout(w);
	v->setContentsMargins(0, 0, 0, 0);
	v->setSpacing(8);
	QFont f = title->font();
	f.setBold(true);
	title->setFont(f);
	v->addWidget(title);
	for (auto *l : lines)
		v->addWidget(l);
	if (button) {
		auto *row = new QHBoxLayout;
		row->addWidget(button);
		row->addStretch();
		v->addLayout(row);
	}
	v->addStretch();
	return w;
}

class Dock : public QWidget {
public:
	Dock()
	{
		auto *root = new QVBoxLayout(this);
		root->setContentsMargins(12, 10, 12, 8);
		root->setSpacing(10);

		auto *head = new QHBoxLayout;
		head->addStretch();
		dot_ = new QLabel(QString::fromUtf8("\xE2\x97\x8F")); // a filled circle; the words next to it say the same, so the colour is not the only signal
		status_ = new QLabel;
		head->addWidget(dot_);
		head->addWidget(status_);
		root->addLayout(head);

		auto *retry = new QPushButton(QObject::tr("Try again"));
		retry->setAccessibleName("Try again");
		retry->setMinimumHeight(44);
		QObject::connect(retry, &QPushButton::clicked, this, [this] { link_->retryNow(); });

		updateText_ = text("");
		stack_ = new QStackedWidget;
		stack_->addWidget(page(text(QObject::tr("The dock needs TCG Bridge")),
				       {text(QObject::tr("Open TCG Bridge on this PC. The dock connects by itself as soon as it starts; nothing needs typing.")),
					text(QObject::tr("Pulls, the queue and the overlay keep working on the site while the dock is down. Only these buttons wait."), kMuted)},
				       retry));
		stack_->addWidget(page(text(QObject::tr("TCG Bridge is connected")), {text(QObject::tr("The dock controls arrive in a later plugin version."), kMuted)}, nullptr));
		stack_->addWidget(page(text(QObject::tr("Update TCG Bridge")), {updateText_}, nullptr));
		root->addWidget(stack_, 1);

		root->addWidget(text(QString("Plugin %1").arg(QString::fromLatin1(TCG_PLUGIN_VERSION)), kMuted));

		apply(tcg::LinkState::Down, "");

		link_ = std::make_unique<tcg::Link>(tcg::defaultLinkFile(), TCG_PLUGIN_VERSION, [this](tcg::LinkState s, std::string v) {
			// Called on the link's thread: hop to this one. If the dock is gone by then, Qt drops the call.
			QMetaObject::invokeMethod(this, [this, s, v] { apply(s, v); }, Qt::QueuedConnection);
		});
		link_->start();
	}

	~Dock() override { link_.reset(); } // joins the link's thread before the widgets go

private:
	void apply(tcg::LinkState s, const std::string &appVersion)
	{
		const char *colour = kRed;
		QString words = QObject::tr("TCG Bridge not running");
		int index = 0;
		if (s == tcg::LinkState::Connected) {
			colour = kGreen;
			words = QObject::tr("TCG Bridge connected");
			index = 1;
		} else if (s == tcg::LinkState::NeedsUpdate) {
			colour = kAmber;
			words = QObject::tr("TCG Bridge needs an update");
			index = 2;
			updateText_->setText(QObject::tr("The dock needs TCG Bridge %1 or newer, and this PC runs %2. Update TCG Bridge (About, Check for updates); the dock connects by itself afterwards.")
						     .arg(QString::fromLatin1(tcg::kMinApp), QString::fromStdString(appVersion)));
		}
		dot_->setStyleSheet(QString("color: %1;").arg(colour));
		status_->setText(words);
		stack_->setCurrentIndex(index);
	}

	QLabel *dot_, *status_, *updateText_;
	QStackedWidget *stack_;
	std::unique_ptr<tcg::Link> link_;
};

} // namespace

QWidget *tcg::createDock()
{
	return new Dock;
}
