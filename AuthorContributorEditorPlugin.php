<?php

/**
 * @file plugins/generic/authorContributorEditor/AuthorContributorEditorPlugin.php
 *
 * Copyright (c) 2026 OJSBR (https://ojsbr.com)
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class AuthorContributorEditorPlugin
 *
 * @brief Gives authors back the ability to edit the contributor list of their
 *        own submissions, as in OJS 3.3 and 3.4, whenever the editor has
 *        granted "Allow to edit submission metadata" to their user group.
 *
 * In OJS 3.5 the author-side workflow builds the Contributors panel without
 * passing the `canEdit` flag, so the panel is always read-only for authors even
 * though the REST API still authorises the change (PublicationWritePolicy ->
 * Repo::submission()->canEditPublication(), i.e. the stage assignment's
 * canChangeMetadata flag). The editorial-side workflow does pass the flag. This
 * plugin restores the missing flag on the author side; every permission check
 * stays exactly where core put it.
 */

namespace APP\plugins\generic\authorContributorEditor;

use APP\core\Application;
use PKP\plugins\GenericPlugin;
use PKP\plugins\Hook;
use PKP\template\PKPTemplateManager;

class AuthorContributorEditorPlugin extends GenericPlugin
{
    /**
     * The dashboard template. Every OJS 3.5 workflow view (editorial dashboard,
     * my submissions, my review assignments) is rendered by it: the workflow
     * page handlers only redirect to the dashboard.
     */
    public const DASHBOARD_TEMPLATE = 'dashboard/editors.tpl';

    /**
     * @copydoc Plugin::register()
     *
     * @param null|mixed $mainContextId
     */
    public function register($category, $path, $mainContextId = null): bool
    {
        if (!parent::register($category, $path, $mainContextId)) {
            return false;
        }
        if (Application::isUnderMaintenance() || !$this->getEnabled($mainContextId)) {
            return true;
        }

        Hook::add('TemplateManager::display', $this->addDashboardScript(...));

        return true;
    }

    /**
     * Hook TemplateManager::display — publishes the script that puts the
     * `canEdit` flag back on the Contributors panel of the author workflow.
     *
     * It has to be loaded after js/build.js (registered by core with
     * STYLE_SEQUENCE_LATE) and before the inline pkp.registry.init() call at
     * the end of the page, so that the Pinia extension is registered before the
     * workflow store is created. STYLE_SEQUENCE_LAST gives us that slot.
     *
     * @param array $args [$templateMgr, &$template, &$output]
     */
    public function addDashboardScript(string $hookName, array $args): bool
    {
        $templateMgr = $args[0];
        $template = $args[1];

        if ($template !== self::DASHBOARD_TEMPLATE) {
            return Hook::CONTINUE;
        }

        $request = Application::get()->getRequest();
        $baseUrl = $request->getBaseUrl() . '/' . $this->getPluginPath();

        $templateMgr->addJavaScript(
            'authorContributorEditor',
            "{$baseUrl}/js/authorContributorEditor.js",
            [
                'priority' => PKPTemplateManager::STYLE_SEQUENCE_LAST,
                'contexts' => ['backend'],
            ]
        );

        return Hook::CONTINUE;
    }

    /**
     * @copydoc Plugin::getContextSpecificPluginSettingsFile()
     */
    public function getContextSpecificPluginSettingsFile(): string
    {
        return $this->getPluginPath() . '/settings.xml';
    }

    /**
     * @copydoc Plugin::getDisplayName()
     */
    public function getDisplayName(): string
    {
        return __('plugins.generic.authorContributorEditor.displayName');
    }

    /**
     * @copydoc Plugin::getDescription()
     */
    public function getDescription(): string
    {
        return __('plugins.generic.authorContributorEditor.description');
    }
}

if (!PKP_STRICT_MODE) {
    class_alias('\APP\plugins\generic\authorContributorEditor\AuthorContributorEditorPlugin', '\AuthorContributorEditorPlugin');
}
