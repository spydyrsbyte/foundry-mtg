import { MTGImporter } from "./importer.js";
import { MTGCardSheet } from "./sheets/card-sheet.js";
import { MTGDeckSheet } from "./sheets/deck-sheet.js";
import { MTGPackSheet } from "./sheets/pack-sheet.js";
import { MTGVoidSheet } from "./sheets/void-sheet.js";
import { MTG } from "./config.js";
import { PackOpener } from "./pack-opener.js";
import { registerSettings, applyTheme } from "./settings.js";
import { BattlefieldHandler } from "./battlefield-handler.js";
import { MTGHUD } from "./hud.js";
import { MTGPlayerManager } from "./apps/player-manager.js";
import { MTGCardManager } from "./apps/card-manager.js";
import { MTGMyCardsManager } from "./apps/my-cards-manager.js";
import { MTGTableManager } from "./apps/table-manager.js";
import { MTGVaultEditor } from "./apps/vault-editor.js";

Hooks.once("init", () => {
    console.log("Foundry MTG System | Initializing system");

    CONFIG.MTG = MTG;

    // Register Document Sheets
    foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);

    // Default sheet is VoidSheet (implied existing or default behavior)
    // Actors.registerSheet("foundry-mtg", MTGVaultEditor, { types: ["player"], makeDefault: true }); // REMOVED

    foundry.documents.collections.Items.registerSheet("foundry-mtg", MTGCardSheet, {
        types: ["card"],
        makeDefault: true,
        label: "MTG Card Sheet"
    });

    foundry.documents.collections.Actors.registerSheet("foundry-mtg", MTGVoidSheet, {
        types: ["planeswalker", "player"],
        makeDefault: true,
        label: "MTG Void Sheet"
    });

    foundry.documents.collections.Items.registerSheet("foundry-mtg", MTGDeckSheet, {
        types: ["deck"],
        makeDefault: true,
        label: "MTG Deck Sheet"
    });

    foundry.documents.collections.Items.registerSheet("foundry-mtg", MTGPackSheet, {
        types: ["pack"],
        makeDefault: true,
        label: "MTG Pack Sheet"
    });

    // Register Handlebars helper for debug view
    Handlebars.registerHelper("json", function (context) {
        return JSON.stringify(context, null, 2);
    });

    // Register Settings
    registerSettings();
});

Hooks.once("ready", () => {
    console.log("Foundry MTG | System Ready.");

    applyTheme();
    BattlefieldHandler.init();

    // Render Custom HUD
    console.log("Foundry MTG | Initializing HUD...");
    MTGHUD.initHooks();
    // V2: render({ force: true })
    new MTGHUD().render({ force: true });

    // Initialize My Cards Reactivity
    MTGMyCardsManager.initHooks();

    // Initialize Player Manager Reactivity
    MTGPlayerManager.initHooks();

    // Expose for manual testing & Global Managers
    game.mtg = foundry.utils.mergeObject(game.mtg || {}, {
        importer: new MTGImporter(),
        packOpener: new PackOpener()
    });

    if (game.user.character) {
        // Auto-Fix: Ensure I own my character (Legacy 'permission' vs 'ownership' fix)
        const char = game.user.character;
        if (!char.isOwner) {
            console.warn("Foundry MTG | repairing ownership for", char.name);
            // We can't update it if we aren't owner... 
            // Wait, if we aren't owner, we can't write.
            // PROVISO: This fix only works if a GM is logged in OR if the system allows it? 
            // Actually, a Player CANNOT fix their own permission if they don't have it.
            // This fix logic needs to run on GM side, or we just notify.
            // Let's rely on the GM to hit "Reassign" or "Create New" with the new code.
            // BUT, if the user is GM testing this, it will work.
        }

        game.mtg.myCardsManager = new MTGMyCardsManager();
        console.log("Foundry MTG | Initialized MyCardsManager");
    }

    // GM Auto-Fix for all players
    if (game.user.isGM) {
        game.users.forEach(u => {
            if (u.character && !u.character.testUserPermission(u, "OWNER")) {
                console.log(`Foundry MTG | Fixing ownership for ${u.name}'s Vault`);
                const update = { ownership: { default: 0, [u.id]: 3 } };
                u.character.update(update);
            }
        });
    }
});

// Replace the Sidebar Tabs with our Custom Navigation
Hooks.on("renderSidebar", async (app, html) => {
    // 1. Determine Roles
    const isGM = game.user.isGM; // Role 4
    const isAGM = game.user.role === 3; // Role 3
    const hasVault = !!game.user.character;

    // Exact Role Logic (Mutually Exclusive for cleaner template)
    // If GM, isGM=true.
    // If AGM, isAGM=true.
    // If Player (has vault, low role), isPlayer=true.
    // If Casual (no vault, low role), isCasual=true.

    const isPlayer = hasVault && !isGM && !isAGM;
    const isCasual = !hasVault && !isGM && !isAGM;

    // 2. Render Utilities Template
    // We replace the #sidebar-tabs content which is an <nav id="sidebar-tabs"> ... </nav> or <div id="sidebar-tabs">
    const templatePath = "systems/foundry-mtg/templates/hud/sidebar/buttons.html";
    const content = await foundry.applications.handlebars.renderTemplate(templatePath, {
        isGM, isAGM, isPlayer, isCasual
    });

    // 3. Find and Replace Tabs
    const $html = $(html);
    const tabs = $html.find("#sidebar-tabs");
    if (tabs.length) {
        tabs.html(content);

        // 4. Surgical Content Cleaning
        // We do NOT replace sidebar-content, as that breaks listeners (Chat/Settings).
        // Instead, we remove the specific sections we don't want.
        const sidebarContent = $html.find("#sidebar-content");
        const allowedIds = ["chat", "settings"];
        /*
        sidebarContent.children().each(function () {
            const id = $(this).attr("id");
            if (id && !allowedIds.includes(id)) {
                $(this).remove();
            }
        });
        */

        // 5. Inject Custom Content
        const isGM = game.user.isGM;
        const isAGM = game.user.role === 3;

        if (isGM || isAGM) {
            // -- Manage Players --
            const playerManager = new MTGPlayerManager();
            const data = await playerManager.getData();

            // Use the SIDEBAR specific template
            const sidebarTemplate = "systems/foundry-mtg/templates/apps/player-manager-sidebar.html";
            const html = await foundry.applications.handlebars.renderTemplate(sidebarTemplate, data);

            // Create the TAB section
            const $playerSection = $(`<section id="mtg-players" class="tab sidebar-tab flexcol" data-tab="mtg-players" data-group="primary"></section>`);
            $playerSection.html(html);

            // Append to content
            const sidebarContent = $html.find("#sidebar-content");
            sidebarContent.append($playerSection);

            // Activate Listeners
            playerManager.activateListeners($playerSection);
        }

        // -- Custom: Card Manager --
        if (game.user.role >= 3) { // Assistant GM or GM
            const cardManager = new MTGCardManager();
            const data = await cardManager.getData();
            const sidebarTemplate = "systems/foundry-mtg/templates/apps/cards-sidebar.html";
            const html = await foundry.applications.handlebars.renderTemplate(sidebarTemplate, data);

            const $cardSection = $(`<section id="mtg-cards" class="tab sidebar-tab flexcol" data-tab="mtg-cards" data-group="primary"></section>`);
            $cardSection.html(html);

            const sidebarContent = $html.find("#sidebar-content");
            sidebarContent.append($cardSection);

            cardManager.activateListeners($cardSection);

            // Expose for refresh triggers from Importer
            game.mtg = game.mtg || {}; // Safe init
            game.mtg.cardManager = cardManager;
        }

        // -- Custom: My Cards (Player) --
        if (game.user.character) {
            const myCardsManager = new MTGMyCardsManager();
            const data = await myCardsManager.getData();
            const sidebarTemplate = "systems/foundry-mtg/templates/apps/my-cards-sidebar.html";
            const html = await foundry.applications.handlebars.renderTemplate(sidebarTemplate, data);

            const $myCardSection = $(`<section id="mtg-mycards" class="tab sidebar-tab flexcol" data-tab="mtg-mycards" data-group="primary"></section>`);
            $myCardSection.html(html);

            const sidebarContent = $html.find("#sidebar-content");
            sidebarContent.append($myCardSection);

            myCardsManager.activateListeners($myCardSection);
            game.mtg = game.mtg || {};
            game.mtg.myCardsManager = myCardsManager;
        }

        // 6. Bind Listeners (Tabs)

        // Helper to manually switch tabs
        const activateCustomTab = (tabName) => {
            console.log("Foundry MTG | Switching to tab:", tabName);

            // 1. Deactivate all items (Sidebar Icons)
            // Note: We must also target standard items if they exist to remove their active class
            tabs.find(".item").removeClass("active");

            // 2. Deactivate all Content Sections (Standard + Custom)
            const sidebar = $("#sidebar");
            sidebar.find(".sidebar-tab").removeClass("active"); // Standard foundry class
            sidebar.find(".tab").removeClass("active");         // Our custom class if mixed

            // 3. Activate Button
            tabs.find(`[data-tab="${tabName}"]`).addClass("active");

            // 4. Activate Content
            // Ensure we target the sections WE injected which have ID matching tabName
            const targetSection = $html.find(`#${tabName}`);
            targetSection.addClass("active");

            // 5. Z-Index Fix: Ensure Sidebar is consistently above canvas
            // Sometimes Foundry drops z-index for inactive states or minimized
            if (!targetSection.length) {
                console.warn("Foundry MTG | Target section not found:", tabName);
            }

            // Force sidebar expansion if collapsed
            if (ui.sidebar._collapsed) ui.sidebar.expand();

            // 6. Notify Foundry to persist state
            ui.sidebar._activeTab = tabName;
        };

        // Generic Handler for Custom Tabs
        const customTabs = ["mtg-mycards", "mtg-players", "mtg-cards", "tables", "jointable"];

        customTabs.forEach(tabName => {
            tabs.find(`[data-tab="${tabName}"]`).click(ev => {
                // If Shift-Click is supported for this tab (popout), handle it
                // ... (Logic preserved below for specific tabs) ...

                // For standard click, if we are intercepting:
                if (!ev.shiftKey) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    activateCustomTab(tabName);
                }
            });
        });

        // -- Specific Shift-Click Handlers (Re-binding with specific logic) --

        // My Cards
        tabs.find('[data-tab="mtg-mycards"]').off("click").click(ev => { // .off to prevent double binding from loop above if we did it
            if (ev.shiftKey) {
                ev.preventDefault();
                ev.stopPropagation();
                if (game.mtg.myCardsManager) game.mtg.myCardsManager.render(true);
            } else {
                activateCustomTab("mtg-mycards");
            }
        });

        // Manage Players
        tabs.find('[data-tab="mtg-players"]').off("click").click(ev => {
            if (ev.shiftKey) {
                ev.preventDefault();
                ev.stopPropagation();
                new MTGPlayerManager().render(true);
            } else {
                activateCustomTab("mtg-players");
            }
        });

        // Manage Cards
        tabs.find('[data-tab="mtg-cards"]').off("click").click(ev => {
            if (ev.shiftKey) {
                ev.preventDefault();
                ev.stopPropagation();
                new MTGCardManager().render(true);
            } else {
                activateCustomTab("mtg-cards");
            }
        });

        // Tables
        tabs.find('[data-tab="tables"]').off("click").click(ev => {
            if (ev.shiftKey) {
                ev.preventDefault();
                ev.stopPropagation();
                new MTGTableManager().render(true);
            } else {
                activateCustomTab("tables");
            }
        });

        // -- FIX Standard Tabs (Settings, Chat) --
        // If we click standard tabs, we must ensure our custom content is hidden
        // and standard content is shown.
        // Foundry's Default `ui.sidebar.activateTab` handles this BUT 
        // if we are correctly replacing the tab bar, we might need to hook into their clicks too
        // or ensure our `activateCustomTab` isn't fighting them.

        // Listener for standard tabs to clean up OUR mess
        const standardTabs = ["chat", "settings", "combat", "scenes", "actors", "items", "journal", "tables", "playlists", "compendium"];

        standardTabs.forEach(tabName => {
            tabs.find(`[data-tab="${tabName}"]`).click(ev => {
                // We don't preventDefault here, let Foundry handle it.
                // BUT we must hide our custom sections if they are active.
                $html.find(".tab.sidebar-tab.custom-mtg-section").removeClass("active");
                // Note: We need to add a class to our sections to easily target them if ID isn't enough

                // Explicitly hide our known IDs
                customTabs.forEach(ct => $html.find(`#${ct}`).removeClass("active"));
            });
        });
    }
});
