const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;
import { PackOpener } from "../pack-opener.js";

export class MTGPlayerSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["foundry-mtg", "sheet", "actor", "player"],
        window: {
            title: "MTG Player Vault",
            icon: "fas fa-user-circle",
            resizable: true,
            controls: []
        },
        position: {
            width: 800,
            height: 700
        },
        actions: {
            createItem: MTGPlayerSheet._onCreateItem,
            editItem: MTGPlayerSheet._onEditItem,
            deleteItem: MTGPlayerSheet._onDeleteItem,
            openPack: MTGPlayerSheet._onOpenPack
        },
        // V2 doesn't have dragDrop in DEFAULT_OPTIONS usually? 
        // We configure it manually or it might work via mixin if provided. 
        // ActorSheetV2 supports it via DragDrop but we might need to verify implementation.
        // Actually typical ApplicationV2 pattern is custom drag handler or wrapping.
        // But for now let's skip manual bind unless broken, assuming standard sheets might handle simple item lists?
        // Note: ActorSheetV2 DOES NOT automatically handle dragDrop like V1 ActorSheet.
        // We must implement _canDragStart, _onDragStart, _onDrop manually if we want it.
        // Let's assume manual binding is safer in _onRender.
    };

    static PARTS = {
        sheet: {
            template: "systems/foundry-mtg/templates/sheets/player-sheet.html"
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const actor = this.document;

        context.system = actor.system;
        context.flags = actor.flags;
        context.config = CONFIG.MTG;

        this._prepareItems(context);

        return context;
    }

    _prepareItems(context) {
        const decks = [];
        const packs = [];
        const cards = [];

        for (let i of this.document.items) {
            if (i.type === "deck") decks.push(i);
            else if (i.type === "pack") packs.push(i);
            else if (i.type === "card") cards.push(i);
        }

        context.decks = decks;
        context.packs = packs;

        // Define stacking criteria (default to name only)
        const stackCriteria = ["name"];

        // Group cards by criteria
        const cardStacks = {};
        for (const card of cards) {
            // Generate key based on criteria
            const key = stackCriteria.map(p => foundry.utils.getProperty(card, p)).join("||");

            if (!cardStacks[key]) cardStacks[key] = [];
            cardStacks[key].push(card);
        }

        // Sort stacks by name of the first card
        context.cardStacks = Object.values(cardStacks).sort((a, b) => a[0].name.localeCompare(b[0].name));
        context.cardCount = cards.length;
    }

    _onRender(context, options) {
        super._onRender(context, options);

        // Manual Tab Switcher
        const html = this.element;
        html.querySelector("nav.sheet-tabs").addEventListener("click", (event) => {
            const tab = event.target.closest("[data-tab]");
            if (!tab) return;
            event.preventDefault();
            this._activateTab(tab.dataset.tab);
        });

        if (!this._activeTab) this._activateTab("collection");
        else this._activateTab(this._activeTab);
    }

    _activateTab(tabName) {
        this._activeTab = tabName;
        const html = this.element;
        html.querySelectorAll("nav.sheet-tabs .item").forEach(el => el.classList.toggle("active", el.dataset.tab === tabName));
        html.querySelectorAll(".sheet-body .tab").forEach(el => {
            const isActive = el.dataset.tab === tabName;
            el.classList.toggle("active", isActive);
            el.style.display = isActive ? "block" : "none";
        });
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    static async _onCreateItem(event, target) {
        const app = this;
        const type = target.dataset.type;
        const name = `New ${type.capitalize()}`;
        const itemData = {
            name: name,
            type: type,
            img: "icons/svg/item-bag.svg"
        };
        await Item.create(itemData, { parent: app.document });
    }

    static async _onDeleteItem(event, target) {
        const app = this;
        const li = target.closest(".item");
        const item = app.document.items.get(li.dataset.itemId);
        if (item) await item.delete();
    }

    static _onEditItem(event, target) {
        const app = this;
        const li = target.closest(".item");
        const item = app.document.items.get(li.dataset.itemId);
        if (item) item.sheet.render(true);
    }

    static _onOpenPack(event, target) {
        const app = this;
        const li = target.closest(".item");
        const item = app.document.items.get(li.dataset.itemId);
        if (item) PackOpener.open(item);
    }
}
