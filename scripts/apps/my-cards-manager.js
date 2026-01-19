const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { PackOpener } from "../pack-opener.js";
import { MTGVaultEditor } from "./vault-editor.js";

export class MTGMyCardsManager extends HandlebarsApplicationMixin(ApplicationV2) {
    static get DEFAULT_OPTIONS() {
        return {
            id: "mtg-my-cards-manager",
            tag: "div",
            classes: ["mtg-sidebar-app"],
            window: {
                title: "My Cards",
                icon: "fas fa-cards",
                resizable: true,
                controls: []
            },
            position: {
                width: 300,
                height: "auto"
            },
            actions: {
                addDeck: MTGMyCardsManager?._onAddDeck || this._onAddDeck,
                editDeck: MTGMyCardsManager?._onEditDeck || this._onEditDeck,
                deleteDeck: MTGMyCardsManager?._onDeleteDeck || this._onDeleteDeck,
                openPack: MTGMyCardsManager?._onOpenPack || this._onOpenPack,
                openVault: MTGMyCardsManager?._onOpenVault || this._onOpenVault
            }
        };
    }

    static PARTS = {
        sheet: {
            template: "systems/foundry-mtg/templates/apps/my-cards-sidebar.html"
        }
    };

    /* -------------------------------------------- */
    /*  Hooks                                       */
    /* -------------------------------------------- */

    static initHooks() {
        console.log("MTGMyCardsManager | Hooks Initialized");
        const refreshIfMine = (doc) => {
            const character = game.user.character;
            if (!character) return;

            // doc can be Actor (if updateActor) or Item (if createItem)
            const isMine = doc.id === character.id || doc.parent?.id === character.id;

            if (isMine) {
                console.log("MTGMyCardsManager | Change detected for user character:", doc.name);
                const mgr = game.mtg.myCardsManager;
                if (mgr) {
                    console.log("MTGMyCardsManager | Refreshing Sidebar...");
                    mgr.render({ force: true });
                } else {
                    console.warn("MTGMyCardsManager | Manager instance not found in game.mtg");
                }
            }
        };

        Hooks.on("createItem", (item) => refreshIfMine(item));
        Hooks.on("updateItem", (item) => refreshIfMine(item));
        Hooks.on("deleteItem", (item) => refreshIfMine(item));
        Hooks.on("updateActor", (actor) => refreshIfMine(actor));
    }

    /* -------------------------------------------- */
    /*  Rendering & Data                            */
    /* -------------------------------------------- */

    // Special behavior: This app injects itself into the sidebar, not a window usually.
    // The previous implementation used refreshSidebar() to inject HTML manually.
    // ApplicationV2 targets 'document.body' by default or a specific 'prepend' option.
    // Since this is a specialized sidebar replacement, we might need to stick to the manual injection approach
    // OR we just use this to provide the HTML generation and manually append it in Hooks?
    // Let's keep the manual `refreshSidebar` logic but adapt functionality.

    // Actually, V2 is strictly windowed or rigid.
    // The previous code extended Application but acted as a renderer for a DIV.
    // Let's bridge it.

    async refreshSidebar() {
        // This method is called externally to re-paint the sidebar section
        if (!game.user.character) return;
        const section = $("#sidebar-content #mtg-mycards");
        if (section.length) {
            // We can just use renderTemplate here directly and bind actions manually?
            // Or rely on V2 to render into that element?
            // V2 supports `swap` which replaces an element.

            // Let's keep it simple: Render this App but use the sidebar as the target?
            // No, standard App V2 expects to manage its own lifecycle.
            // We will treat this class as a Data Provider + Action Handler for the sidebar.

            const context = await this._prepareContext({});
            const html = await foundry.applications.handlebars.renderTemplate(this.constructor.PARTS.sheet.template, context);
            section.html(html);

            // Manually bind actions since we aren't using the full AppV2 lifecycle for this DOM snippet
            this._activateManualListeners(section[0]);
        }
    }

    _activateManualListeners(element) {
        // Dynamic binding with logging
        const inputs = element.querySelectorAll("[data-action]");

        for (const input of inputs) {
            const action = input.dataset.action;
            // derive handler name: openVault -> _onOpenVault
            const handlerName = `_on${action.charAt(0).toUpperCase() + action.slice(1)}`;

            // Look for static method first, then instance method
            const handler = this.constructor[handlerName] || this[handlerName];

            if (typeof handler === "function") {
                input.addEventListener("click", async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    try {
                        await handler.call(this, event, input);
                    } catch (err) {
                        console.error(`MTGMyCardsManager | Error executing ${action}:`, err);
                        ui.notifications.error(`Error executing ${action}: ${err.message}`);
                    }
                });
            } else {
                console.warn(`MTGMyCardsManager | No handler found for action: ${action} (${handlerName})`);
            }
        }
    }

    /* -------------------------------------------- */
    /*  Compatibility & Helper Methods              */
    /* -------------------------------------------- */

    async getData() {
        // Compatibility shim for external callers (foundry-mtg.js)
        return this._prepareContext({});
    }

    activateListeners(html) {
        // Compatibility shim for external callers
        // If html is jQuery object, unwrap it
        const element = html instanceof jQuery ? html[0] : html;
        this._activateManualListeners(element);
    }

    async _prepareContext(options) {
        const vault = game.user.character;
        if (!vault) return { decks: [], packs: [] };

        // 1. Get Decks
        const decks = vault.items.filter(i => i.type === "deck").map(d => {
            return {
                id: d.id,
                name: d.name,
                colors: d.system.colors || []
            };
        });

        // 2. Get Packs (Grouped) (Logic identical to before)
        const packItems = vault.items.filter(i => i.type === "pack");
        const packMap = {};

        for (const p of packItems) {
            const code = p.system.set_code || "unk";
            if (!packMap[code]) {
                const pack = game.packs.find(p => p.metadata.name === `mtg-cards-${code.toLowerCase()}`);
                const fullName = pack ? pack.metadata.label.replace(`MTG: ${code.toUpperCase()}`, "").trim() : code.toUpperCase();

                packMap[code] = {
                    code: code,
                    setName: fullName || code.toUpperCase(),
                    count: 0
                };
            }
            packMap[code].count++;
        }
        const packs = Object.values(packMap).sort((a, b) => a.code.localeCompare(b.code));

        return { decks, packs };
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    static async _onAddDeck(event, target) {
        const vault = game.user.character;
        if (!vault) return;
        const deckData = {
            name: "New Deck",
            type: "deck",
            img: "icons/sundries/books/book-red-bound.webp"
        };
        const deck = await Item.create(deckData, { parent: vault });
        if (deck) deck.sheet.render(true);
    }

    static async _onEditDeck(event, target) {
        const btn = target.closest("[data-deckid]");
        const deckId = btn.dataset.deckid;
        const vault = game.user.character;
        const deck = vault.items.get(deckId);
        if (deck) deck.sheet.render(true);
    }

    static async _onDeleteDeck(event, target) {
        const btn = target.closest("[data-deckid]") || target;
        const deckId = btn.dataset.deckid;
        const vault = game.user.character;
        const deck = vault.items.get(deckId);
        if (!deck) return;

        const confirm = await Dialog.confirm({
            title: "Delete Deck",
            content: `<p>Are you sure you want to delete <strong>${deck.name}</strong>?</p>`
        });
        if (confirm) {
            await deck.delete();
            // Sidebar auto-refreshes via hooks
        }
    }

    static async _onOpenPack(event, target) {
        const btn = target;
        const code = btn.dataset.setcode;
        const vault = game.user.character;
        const pack = vault.items.find(i => i.type === "pack" && i.system.set_code === code);

        if (pack) {
            const confirm = await Dialog.confirm({
                title: `Open Pack: ${pack.name}`,
                content: `<p>Open this pack? It will be consumed.</p>`
            });

            if (confirm) {
                try {
                    await PackOpener.open(pack);
                } catch (err) {
                    ui.notifications.error(err.message);
                }
            }
        }
    }

    static _onOpenVault(event, target) {
        const vault = game.user.character;
        if (vault) {
            new MTGVaultEditor(vault).render({ force: true });
        } else {
            ui.notifications.warn("No Vault assigned to your user.");
        }
    }
}
