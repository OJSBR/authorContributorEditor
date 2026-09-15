<?php

/**
 * @file plugins/generic/authorContributorEditor/tests/AuthorContributorEditorTest.php
 *
 * Copyright (c) 2026 OJSBR (https://ojsbr.com)
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class AuthorContributorEditorTest
 *
 * @brief The script is added to the dashboard only, in the slot the store
 *        extension needs, and it only fills in a missing flag.
 */

namespace APP\plugins\generic\authorContributorEditor\tests;

use APP\plugins\generic\authorContributorEditor\AuthorContributorEditorPlugin;
use PHPUnit\Framework\Attributes\CoversClass;
use PKP\template\PKPTemplateManager;
use PKP\tests\PKPTestCase;

#[CoversClass(AuthorContributorEditorPlugin::class)]
class AuthorContributorEditorTest extends PKPTestCase
{
    /**
     * A template manager that keeps the scripts it is given.
     */
    protected function templateManager(): object
    {
        return new class () {
            public array $scripts = [];

            public function addJavaScript($name, $script, $args = [])
            {
                $this->scripts[$name] = [$script, $args];
            }
        };
    }

    public function testTheScriptIsAddedToTheDashboardAfterTheCoreBuild(): void
    {
        $plugin = new AuthorContributorEditorPlugin();
        $templateMgr = $this->templateManager();

        $plugin->addDashboardScript('TemplateManager::display', [$templateMgr, AuthorContributorEditorPlugin::DASHBOARD_TEMPLATE, null]);

        $this->assertCount(1, $templateMgr->scripts);
        [$url, $args] = $templateMgr->scripts['authorContributorEditor'];
        $this->assertStringEndsWith('/js/authorContributorEditor.js', $url);
        // After js/build.js (STYLE_SEQUENCE_LATE), before pkp.registry.init() at the end of the page.
        $this->assertSame(PKPTemplateManager::STYLE_SEQUENCE_LAST, $args['priority']);
        $this->assertSame(['backend'], $args['contexts']);
    }

    public function testOtherTemplatesGetNothing(): void
    {
        $templateMgr = $this->templateManager();
        foreach (['frontend/pages/index.tpl', 'management/settings/website.tpl', 'dashboard/index.tpl'] as $template) {
            (new AuthorContributorEditorPlugin())->addDashboardScript('TemplateManager::display', [$templateMgr, $template, null]);
        }
        $this->assertSame([], $templateMgr->scripts);
    }

    public function testTheScriptUsesTheStoreExtensionAndOnlyFillsAMissingFlag(): void
    {
        $script = (string) preg_replace('#/\*.*?\*/#s', '', (string) file_get_contents(dirname(__DIR__) . '/js/authorContributorEditor.js'));
        $this->assertStringContainsString("pkp.registry.storeExtendFn(\n\t\t'workflow',\n\t\t'getPrimaryItems',", $script);
        $this->assertStringContainsString("typeof item.props.canEdit !== 'undefined'", $script);
        $this->assertStringContainsString('args.permissions.canEditPublication', $script);
        // Nothing else of the workflow is changed.
        $this->assertSame(1, substr_count($script, 'item.props.canEdit ='));
    }
}
