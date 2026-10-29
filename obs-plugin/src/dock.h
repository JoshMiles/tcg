// The TCG dock (ROADMAP 62.3).
#pragma once

class QWidget;

namespace tcg {

// A new dock widget; OBS owns it once it is added with obs_frontend_add_dock_by_id.
QWidget *createDock();

} // namespace tcg
