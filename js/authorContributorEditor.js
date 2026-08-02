/**
 * @file plugins/generic/authorContributorEditor/js/authorContributorEditor.js
 *
 * Copyright (c) 2026 OJSBR (https://ojsbr.com)
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @brief Restores the `canEdit` flag on the Contributors panel of the author
 *        workflow in OJS 3.5.
 *
 * The workflow store builds the items of each publication menu entry through
 * getPrimaryItems(). The editorial-side configuration returns
 *
 *     {component: 'ContributorManager', props: {submission, publication,
 *      canEdit: permissions.canEditPublication}}
 *
 * while the author-side configuration omits `canEdit` entirely, so
 * ContributorsListPanel receives canEditPublication === undefined and hides the
 * add / edit / delete / reorder / primary-contact actions.
 *
 * We wrap getPrimaryItems through the official extension API
 * (pkp.registry.storeExtendFn) and fill in the flag only when it is missing,
 * using the very same permission core computed for the page. Nothing else is
 * touched: `permissions.canEditPublication` already mirrors the stage
 * assignment's canChangeMetadata flag and is already forced to false for
 * authors once a publication is published or scheduled. The REST API keeps
 * enforcing the same rule server-side.
 */
(function () {
	'use strict';

	if (
		typeof pkp === 'undefined' ||
		!pkp.registry ||
		typeof pkp.registry.storeExtendFn !== 'function'
	) {
		return;
	}

	pkp.registry.storeExtendFn(
		'workflow',
		'getPrimaryItems',
		function (items, args) {
			if (!Array.isArray(items)) {
				return items;
			}

			var canEdit = !!(
				args &&
				args.permissions &&
				args.permissions.canEditPublication
			);

			items.forEach(function (item) {
				if (
					!item ||
					item.component !== 'ContributorManager' ||
					!item.props ||
					// Set by the editorial configuration: leave it alone.
					typeof item.props.canEdit !== 'undefined'
				) {
					return;
				}
				item.props.canEdit = canEdit;
			});

			return items;
		}
	);
})();
