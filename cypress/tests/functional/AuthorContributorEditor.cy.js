/**
 * @file cypress/tests/functional/AuthorContributorEditor.cy.js
 *
 * Copyright (c) 2026 OJSBR (https://ojsbr.com)
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * Functional tests: the Contributors panel an author sees in the workflow.
 *
 * Parameters (--env): contextPath, adminUser, adminPassword (captcha on login
 * must be off for the run). The defaults match the data set of PKP's continuous
 * integration; the first test enables the plugin when it is off. The author test
 * needs an author account and two of its submissions, one whose assignment may
 * change metadata and one that may not: authorUser, authorPassword,
 * editableSubmissionId, lockedSubmissionId (skipped without them).
 */

describe('Author Contributor Editor plugin', function() {
	const contextPath = Cypress.env('contextPath') || 'publicknowledge';
	const adminUser = Cypress.env('adminUser') || 'admin';
	const adminPassword = Cypress.env('adminPassword') || 'admin';
	const authorUser = Cypress.env('authorUser');
	const authorPassword = Cypress.env('authorPassword');
	const editableSubmissionId = Cypress.env('editableSubmissionId');
	const lockedSubmissionId = Cypress.env('lockedSubmissionId');

	const row = 'authorcontributoreditorplugin';

	// ---- OJSBR spec helpers (padrão v2): work on OJS/OMP 3.3, 3.4 and 3.5 and in PKP's CI ----

	const pageUrl = (path) => '/index.php/' + contextPath + (path ? '/' + path : '');

	// Same as PKP's cy.waitJQuery(), which the support files of OJS 3.3 test sites may lack.
	// The Plugins tab can keep requests open for a while (the plugin gallery), hence the timeout.
	const waitJQuery = () => cy.window().its('jQuery.active', {timeout: 60000}).should('eq', 0);

	// Requests carry the browser's User-Agent: OJS 3.3 drops a session whose agent changes.
	const request = (options) => cy.window({log: false}).then((win) => cy.request(Object.assign(
		typeof options === 'string' ? {url: options} : options,
		{headers: Object.assign({'User-Agent': win.navigator.userAgent}, (typeof options === 'string' ? {} : options.headers) || {})}
	)));

	// Signs in through requests (the login page can re-render while it is typed into), then
	// falls back to the form when the session did not stick (OJS 3.3 cookie handling).
	const login = (username, password) => {
		cy.clearCookies();
		request(pageUrl('login')).then((response) => {
			const token = /name="csrfToken" value="([^"]+)"/.exec(response.body)[1];
			// The form posts to the URL with the language: a redirect would turn the POST into a GET.
			const action = /<form[^>]*id="login"[^>]*action="([^"]+)"/.exec(response.body)[1];
			request({method: 'POST', url: action, form: true, body: {csrfToken: token, username: username, password: password}, log: false});
		});
		cy.visit(pageUrl('submissions') + '?reload=' + Date.now());
		cy.get('body').then(($body) => {
			if ($body.find('form#login').length) {
				cy.get('form#login input[name="username"]').type(username, {delay: 0});
				cy.get('form#login input[name="password"]').type(password, {delay: 0, log: false});
				cy.get('form#login').submit();
				cy.get('form#login', {timeout: 30000}).should('not.exist');
			}
		});
	};

	// REST API calls made from the page itself, so they carry the browser's own session.
	const api = (path, options = {}) => cy.window({log: false}).then((win) => cy.wrap(
		win.fetch(path, Object.assign({credentials: 'same-origin'}, options)).then((response) => {
			if (!response.ok) {
				return response.text().then((text) => {
					throw new Error(path + ' answered ' + response.status + ': ' + text.slice(0, 300));
				});
			}
			return response.json();
		}),
		{log: false, timeout: 30000}
	));

	// The website settings page on its Plugins tab (a new query string forces a load). Load it
	// once per test: loading it again while its plugin gallery request is pending stalls the
	// web server of PKP's CI; API calls and settings modals work on the page already open.
	const openPluginsTab = () => {
		cy.visit(pageUrl('management/settings/website') + '?reload=' + Date.now() + '#plugins');
		cy.get('button[id="plugins-button"]', {timeout: 60000}).click();
		cy.get('button[id="plugins-button"]').should('have.attr', 'aria-selected', 'true');
		waitJQuery();
	};

	// Enables the plugin in the grid when it is off (never turns it off).
	const enablePlugin = (rowName) => {
		cy.get('input[id^="select-cell-' + rowName + '-enabled"]', {timeout: 30000}).then(($checkbox) => {
			if (!$checkbox.is(':checked')) {
				cy.wrap($checkbox).click();
				waitJQuery();
			}
		});
		cy.get('input[id^="select-cell-' + rowName + '-enabled"]').should('be.checked');
	};

	// Opens the settings modal from the grid, without reloading the page: a reload right
	// after saving can stall the web server of PKP's CI. The form is fetched each time.
	const openPluginSettings = (rowName, formSelector) => {
		cy.get('a[id*="-row-' + rowName + '-settings-button-"]', {timeout: 30000}).then(($link) => {
			if (!$link.is(':visible')) {
				cy.get('tr[id$="-row-' + rowName + '"] a.show_extras').first().click();
			}
		});
		// The grid may still be animating the extras row: the link is clicked once it exists.
		cy.get('a[id*="-row-' + rowName + '-settings-button-"]').first().click({force: true});
		waitJQuery();
		cy.window().should((win) => {
			expect(win.jQuery(formSelector).data('pkp.handler')).to.exist;
		});
	};

	// ---- end of helpers ----

	// REST calls made from the page, carrying its session and token.
	const send = (path, method, body) => cy.window({log: false}).then((win) => cy.wrap(
		win.fetch(path, {
			method: method,
			credentials: 'same-origin',
			headers: {'Content-Type': 'application/json', 'X-Csrf-Token': win.pkp.currentUser.csrfToken},
			body: body === undefined ? undefined : JSON.stringify(body),
		}).then((response) => response.json().then((answer) => ({status: response.status, body: answer}))),
		{log: false, timeout: 60000}
	));

	// A site with the Altcha captcha turned on for registration expects a solved
	// proof of work along with the form. The PKP test data has it off.
	const solveAltcha = (win) => {
		const widget = win.document.querySelector('altcha-widget');
		if (!widget) {
			return;
		}
		const challenge = JSON.parse(widget.getAttribute('challengejson'));
		const encoder = new win.TextEncoder();
		const digest = async (number) => {
			const buffer = await win.crypto.subtle.digest(challenge.algorithm, encoder.encode(challenge.salt + number));
			return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
		};

		return (async () => {
			for (let number = 0; number <= (challenge.maxnumber || 100000); number++) {
				if (await digest(number) === challenge.challenge) {
					const input = win.document.createElement('input');
					input.type = 'hidden';
					input.name = 'altcha';
					input.value = win.btoa(JSON.stringify({
						algorithm: challenge.algorithm, challenge: challenge.challenge, number: number,
						salt: challenge.salt, signature: challenge.signature, took: 1,
					}));
					win.document.querySelector('form[id=register]').appendChild(input);
					widget.remove();

					return;
				}
			}
			throw new Error('the Altcha challenge could not be solved');
		})();
	};

	let orcidSeed = Math.floor(Math.random() * 900000);
	const anOrcid = () => {
		const digits = ('000000021' + String(orcidSeed++).padStart(6, '0')).slice(0, 15);
		let total = 0;
		for (const digit of digits) {
			total = (total + Number(digit)) * 2;
		}
		const result = (12 - (total % 11)) % 11;

		return 'https://orcid.org/' + (digits + (result === 10 ? 'X' : String(result))).replace(/(.{4})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4');
	};

	// Registers an author through the public form and enables the account, so the
	// test has the person the plugin is about without depending on a data set.
	const registerAuthor = () => {
		const account = {username: 'aceauthor' + Date.now().toString().slice(-8), password: 'Ojsbr!Teste2026'};
		account.email = account.username + '@mailinator.com';

		cy.clearCookies();
		cy.visit(pageUrl('user/register') + '?reload=' + Date.now());
		cy.get('form#register input[name="givenName"]').type('Autor', {delay: 0});
		cy.get('form#register input[name="familyName"]').type('Contribuidor', {delay: 0});
		cy.get('form#register input[name="affiliation"]').type('OJSBR', {delay: 0});
		cy.get('form#register select[name="country"]').select('BR');
		cy.get('form#register input[name="email"]').type(account.email, {delay: 0});
		cy.get('form#register input[name="username"]').type(account.username, {delay: 0});
		cy.get('form#register input[name="password"]').type(account.password, {delay: 0, log: false});
		cy.get('form#register input[name="password2"]').type(account.password, {delay: 0, log: false});
		cy.get('body').then(($body) => {
			if ($body.find('form#register input[name="privacyConsent"]').length) {
				cy.get('form#register input[name="privacyConsent"]').check({force: true});
			}
			if ($body.find('form#register input[name="orcid"]').length) {
				cy.get('form#register input[name="orcid"]').clear().type(anOrcid(), {delay: 0});
			}
			if ($body.find('form#register input[name="whatsapp"]').length) {
				cy.get('form#register input[name="whatsapp"]').clear().type('+5511988887777', {delay: 0});
			}
		});
		cy.window().then((win) => solveAltcha(win));
		cy.get('form#register').submit();
		cy.get('form#register', {timeout: 30000}).should('not.exist');

		login(adminUser, adminPassword);
		api(pageUrl('api/v1/users?searchPhrase=' + account.username + '&count=10')).then((users) => {
			const user = (users.items || []).find((item) => item.userName === account.username || item.username === account.username);
			expect(user, 'the account of the author was created').to.exist;
			cy.window({log: false}).then((win) => request({
				method: 'POST',
				url: pageUrl('$$$call$$$/grid/settings/user/user-grid/disable-user'),
				form: true,
				failOnStatusCode: false,
				body: {userId: user.id, enable: 1, disableReason: '', csrfToken: win.pkp.currentUser.csrfToken},
			}));
		});

		return cy.wrap(account, {log: false});
	};

	// Submissions made by the test, deleted in after() even when it fails.
	const madeHere = [];

	// The Contributors panel of a submission in the author's workflow.
	const openContributors = (submissionId) => {
		cy.visit(pageUrl('dashboard/mySubmissions') + '?workflowSubmissionId=' + submissionId + '&workflowMenuKey=publication_contributors');
		cy.get('[data-cy="contributor-manager"]', {timeout: 60000}).should('be.visible');
	};

	it('Enables the plugin and loads its script once on the dashboard', function() {
		login(adminUser, adminPassword);
		openPluginsTab();
		enablePlugin(row);
		cy.visit(pageUrl('dashboard/editorial') + '?reload=' + Date.now());
		cy.get('script[src*="/authorContributorEditor/js/authorContributorEditor.js"]').should('have.length', 1);
		cy.window().its('pkp.registry.storeExtendFn').should('be.a', 'function');
	});

	// What the plugin gives back: on a submission of their own, where the
	// assignment lets them change the metadata, the author sees the actions of the
	// Contributors panel — and the server really accepts what those actions do,
	// which is what the test reads back.
	it('Lets the author work on the contributors of their own submission', function() {
		const account = authorUser ? {username: authorUser, password: authorPassword} : null;

		// The language of the journal is read while the editor is signed in: an
		// account with no role yet does not open the page that carries it.
		const journal = {};
		login(adminUser, adminPassword);
		cy.visit(pageUrl('submissions') + '?reload=' + Date.now());
		cy.window({log: false}).its('pkp.context.primaryLocale').then((locale) => {
			journal.locale = locale;
		});
		// The section as well: a journal asks for one and an account with no role
		// cannot list them.
		request({url: pageUrl('api/v1/sections?count=1'), failOnStatusCode: false}).then((response) => {
			let body = response.body;
			if (typeof body === 'string') {
				try {
					body = JSON.parse(body);
				} catch (error) {
					body = {};
				}
			}
			journal.sectionId = (body && body.items && body.items.length) ? body.items[0].id : null;
		});

		(account ? cy.wrap(account, {log: false}) : registerAuthor()).then((author) => {
			login(author.username, author.password);
			cy.visit(pageUrl('user/profile') + '?reload=' + Date.now());
			cy.get('#profileTabs', {timeout: 30000}).should('exist');

			cy.then(() => journal.locale).then((locale) => {
				return send(
					pageUrl('api/v1/submissions'),
					'POST',
					journal.sectionId ? {locale: locale, sectionId: journal.sectionId} : {locale: locale}
				).then((created) => {
					expect(created.status, 'the submission of the author was created: ' + JSON.stringify(created.body)).to.be.within(200, 201);
					madeHere.push(created.body.id);

					// The panel, in the author's own workflow, offers the actions.
					openContributors(created.body.id);
					cy.get('[data-cy="contributor-manager"] button', {timeout: 60000})
						.should('have.length.at.least', 1);

					// And they are not a promise the server breaks: what the panel
					// offers, the endpoint behind it accepts, and the contributor is
					// there afterwards.
					return api(pageUrl('api/v1/submissions/' + created.body.id + '/publications/' + created.body.currentPublicationId))
						.then((publication) => {
							const groupId = ((publication.authors || [])[0] || {}).userGroupId;
							expect(groupId, 'the author of the submission belongs to a group').to.exist;
							const base = pageUrl('api/v1/submissions/' + created.body.id + '/publications/' + created.body.currentPublicationId + '/contributors');
							const contributor = {
								givenName: {[locale]: 'Coautor'},
								familyName: {[locale]: 'Doteste'},
								email: 'coauthor' + Date.now().toString().slice(-8) + '@mailinator.com',
								country: 'BR',
								affiliations: [{name: {[locale]: 'OJSBR'}}],
								biography: {[locale]: '<p>Co-author of the test.</p>'},
								userGroupId: groupId,
							};

							return send(base, 'POST', contributor)
								.then((answer) => (
									answer.status === 400 && answer.body && answer.body.orcid
										&& !/not permitted/i.test(JSON.stringify(answer.body.orcid))
										? send(base, 'POST', Object.assign({}, contributor, {orcid: anOrcid()}))
										: cy.wrap(answer, {log: false})
								))
								.then((answer) => {
									expect(answer.status, 'the author was allowed to add a contributor: ' + JSON.stringify(answer.body))
										.to.be.within(200, 201);

									return api(base);
								})
								.then((contributors) => {
									const names = (contributors.items || contributors || []).map((item) => (item.familyName || {})[locale]);
									expect(names, 'the contributor the author added is stored').to.include('Doteste');
								});
						});
				});
			});
		});
	});

	after(function() {
		if (!madeHere.length) {
			return;
		}
		login(adminUser, adminPassword);
		cy.visit(pageUrl('submissions') + '?reload=' + Date.now());
		madeHere.forEach((id) => send(pageUrl('api/v1/submissions/' + id), 'DELETE'));
	});
});
