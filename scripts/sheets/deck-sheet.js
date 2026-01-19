
const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;
import { MTG } from "../config.js";

export class MTGDeckSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["foundry-mtg", "sheet", "item", "deck"],
        window: {
            title: "MTG Deck Editor",
            icon: "fas fa-book-open",
            resizable: true,
            controls: []
        },
        position: {
            width: 700,
            height: 600
        },
        actions: {
            deleteCard: MTGDeckSheet._onDeleteCard,
            editCard: MTGDeckSheet._onEditCard
        }
    };

    static PARTS = {
        sheet: {
            template: "systems/foundry-mtg/templates/sheets/deck-sheet.html"
        }
    };

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const item = this.document;

        context.system = item.system;
        context.flags = item.flags;
        context.config = CONFIG.MTG;

        // Prepare Card Lists
        const cards = context.system.cards || { commander: [], main: [], side: [] };
        context.commanderCards = cards.commander || [];

        // Group Mainboard and Sideboard into Stacks
        context.mainboardStacks = this._prepareCardStacks(cards.main || []);
        context.sideboardStacks = this._prepareCardStacks(cards.side || []);

        return context;
    }

    _prepareCardStacks(cards) {
        // Define stacking criteria (default to name only)
        const stackCriteria = ["name"];

        // Group cards by criteria
        const cardStacks = {};
        cards.forEach((card, index) => {
            // Inject original index for deletion from stacks
            card._originalIndex = index;

            // Generate key based on criteria
            const key = stackCriteria.map(p => foundry.utils.getProperty(card, p)).join("||");

            if (!cardStacks[key]) cardStacks[key] = [];
            cardStacks[key].push(card);
        });

        // Sort stacks by name of the first card
        return Object.values(cardStacks).sort((a, b) => a[0].name.localeCompare(b[0].name));
    }

    /* -------------------------------------------- */
    /*  Rendering & Interaction                     */
    /* -------------------------------------------- */

    _onRender(context, options) {
        super._onRender(context, options);

        // Manual Tab Listener
        const html = this.element;
        html.querySelector("nav.sheet-tabs").addEventListener("click", (event) => {
            const tab = event.target.closest("[data-tab]");
            if (!tab) return;
            event.preventDefault();
            this._activateTab(tab.dataset.tab);
        });

        if (!this._activeTab) this._activateTab("main");
        else this._activateTab(this._activeTab);

        // Manual Drop Listener for Debugging/Fallback (as verified working previously)
        html.addEventListener("drop", this._onDrop.bind(this));
    }

    _activateTab(tabName) {
        this._activeTab = tabName;
        const html = this.element;

        html.querySelectorAll("nav.sheet-tabs .item").forEach(el => {
            el.classList.toggle("active", el.dataset.tab === tabName);
        });

        html.querySelectorAll(".sheet-body .tab").forEach(el => {
            const isActive = el.dataset.tab === tabName;
            el.classList.toggle("active", isActive);
            if (isActive) el.style.display = "block"; // or flex depending on layout? Main body of deck sheet uses block usually?
            else el.style.display = "none";
        });
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    static async _onDeleteCard(event, target) {
        const app = this;
        const deck = app.document;

        // Retrieve index from the target hierarchy
        const li = target.closest(".card-item");
        let index = target.dataset.originalIndex;
        if (index === undefined) index = li.dataset.index; // fallback

        const section = li.dataset.section; // 'main', 'side', 'commander'
        const cards = foundry.utils.deepClone(deck.system.cards);

        if (cards[section] && cards[section][index]) {
            cards[section].splice(index, 1);

            const updateData = { "system.cards": cards };
            if (section === "commander" && cards.commander.length === 0) {
                updateData["img"] = "icons/svg/item-bag.svg";
            }

            await deck.update(updateData);
        }
    }

    static _onEditCard(event, target) {
        // Placeholder for viewing card details if we want double click or edit button
    }

    /* -------------------------------------------- */
    /*  Drag and Drop                               */
    /* -------------------------------------------- */

    async _onDrop(event) {
        event.preventDefault();
        console.log("MTGDeckSheet (V2) | Drop Detected");

        try {
            const data = TextEditor.getDragEventData(event);
            console.log("MTGDeckSheet | Drop Data:", data);

            const item = await Item.implementation.fromDropData(data);
            console.log("MTGDeckSheet | Resolved Item:", item);

            if (!item || (item.type !== "card" && item.type !== "mtg-card")) {
                console.warn("MTGDeckSheet | Drop rejected. Not a card.");
                return;
            }

            // Determine drop target
            const target = event.target.closest("[data-section]");
            const section = target?.dataset?.section || "main";
            console.log("MTGDeckSheet | Target Section:", section);

            return this._addCardToDeck(item, section);
        } catch (err) {
            console.error("MTGDeckSheet | Drop Error:", err);
        }
    }

    async _addCardToDeck(item, section = "main") {
        console.log(`Adding ${item.name} to ${this.document.name} (${section})`);
        const deck = this.document;
        const cards = foundry.utils.deepClone(deck.system.cards || { main: [], side: [], commander: [] });
        const cardData = item.toObject();
        delete cardData._id; // Remove ID to avoid conflicts if re-instantiated

        if (!cards[section]) cards[section] = [];
        cards[section].push(cardData);

        // Update image if adding commander
        let updateData = { [`system.cards.${section} `]: cards[section] };
        if (section === "commander" && cards.commander.length > 0) {
            updateData["img"] = cardData.img;
        }

        await this.item.update(updateData);
    }
}
