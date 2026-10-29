// TCG for OBS (ROADMAP 62.3): adds the "TCG" dock, which talks to TCG Bridge on this PC.
#include <obs-module.h>
#include <obs-frontend-api.h>

#include <ixwebsocket/IXNetSystem.h>

#include "dock.h"

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE("tcg-obs", "en-US")

MODULE_EXPORT const char *obs_module_description(void)
{
	return "A dock for TCG Bridge: the live controls for the Cheesygidds TCG stream.";
}

bool obs_module_load(void)
{
	ix::initNetSystem(); // Winsock, for the link to TCG Bridge
	blog(LOG_INFO, "[tcg-obs] loaded, version %s", TCG_PLUGIN_VERSION);
	return true;
}

// The main window exists by now, so the dock can be added.
void obs_module_post_load(void)
{
	obs_frontend_add_dock_by_id("tcg-dock", obs_module_text("DockTitle"), tcg::createDock());
}
