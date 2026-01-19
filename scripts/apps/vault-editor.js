import { MTGCardViewer } from "./card-viewer.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class MTGVaultEditor extends HandlebarsApplicationMixin(ApplicationV2) {

    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
    }

    static DEFAULT_OPTIONS = {
        id: "mtg-vault-editor",
        tag: "form",
        classes: ["mtg", "sheet", "vault-editor"],
        window: {
            title: "MTG Vault Editor",
            icon: "fas fa-dungeon",
            resizable: true,
            controls: []
        },
        position: {
            width: 800,
            height: 700
        },
        actions: {
            createDeck: MTGVaultEditor._onCreateDeck,
            editDeck: MTGVaultEditor._onEditDeck,
            deleteDeck: MTGVaultEditor._onDeleteDeck,
            viewCard: MTGVaultEditor._onViewCard,
            toggleFilter: MTGVaultEditor._onToggleFilter
        }
    };

    static PARTS = {
        sheet: {
            template: "systems/foundry-mtg/templates/apps/vault-editor.html"
        }
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    async _prepareContext(options) {
        const actor = this.actor;
        // Ensure filters exist
        this.filters = this.filters || { name: "", colors: {}, rarities: {}, groupBy: "name" };

        const context = {
            actor: actor,
            decks: [],
            cards: [],
            totalCards: 0,
            filters: this.filters,
            filterExpanded: this.filterExpanded || false,
            config: {
                colors: { "W": "White", "U": "Blue", "B": "Black", "R": "Red", "G": "Green" },
                rarities: { "common": "Common", "uncommon": "Uncommon", "rare": "Rare", "mythic": "Mythic" },
                groupBy: { "name": "Name", "cmc": "Mana Cost", "type": "Type", "set": "Set", "rarity": "Rarity" }
            }
        };

        // 1. Separate Cards and Decks
        const items = actor.items.contents;
        context.decks = items.filter(i => i.type === "deck");

        let rawCards = items.filter(i => !["deck", "pack", "class", "subclass"].includes(i.type));

        // 1.5 Apply Filters
        if (this.filters.name) {
            rawCards = rawCards.filter(c => c.name.toLowerCase().includes(this.filters.name.toLowerCase()));
        }

        // Filter Colors (OR Logic if multiple checked, or AND? Standard is usually OR for tags)
        // If any color is selected, card must match one of them? Or strict match?
        // Let's go with: If any selected, card must have at least one of them.
        const selectedColors = Object.keys(this.filters.colors || {});
        if (selectedColors.length > 0) {
            rawCards = rawCards.filter(c => {
                const cColors = c.system.colors || [];
                return selectedColors.some(k => cColors.includes(k));
            });
        }

        const selectedRarities = Object.keys(this.filters.rarities || {});
        if (selectedRarities.length > 0) {
            rawCards = rawCards.filter(c => selectedRarities.includes(c.system.rarity));
        }

        // 2. Strict Grouping (by Scryfall ID)
        const groups = new Map();
        for (const card of rawCards) {
            const key = card.system.props?.id || card.name;
            if (!groups.has(key)) {
                groups.set(key, { item: card, quantity: 0, ids: [] });
            }
            const entry = groups.get(key);
            entry.quantity++;
            entry.ids.push(card.id);
        }
        let strictStacks = Array.from(groups.values());

        // 3. Sorting (Color -> Name)
        const getColorWeight = (item) => {
            if (item.type === "land") return 8;
            const typeLine = (item.system.type_line || "").toLowerCase();
            if (typeLine.includes("land")) return 8;
            const colors = item.system.colors || [];
            if (colors.length === 0) return 7;
            if (colors.length > 1) return 6;
            const colorMap = { "W": 1, "U": 2, "B": 3, "R": 4, "G": 5 };
            return colorMap[colors[0]] || 7;
        };

        strictStacks.sort((a, b) => {
            const wA = getColorWeight(a.item);
            const wB = getColorWeight(b.item);
            if (wA !== wB) return wA - wB;
            return a.item.name.localeCompare(b.item.name);
        });

        // 4. Logical Grouping (Visual Stacks)
        // We group 'strictStacks' by the chosen property.
        // Result is an array of objects: { isStack: boolean, item?: Item, quantity?: number, stacks?: Array }
        const logicalGroups = [];
        const groupKeyMap = new Map();

        const getGroupKey = (stack) => {
            const item = stack.item;
            switch (this.filters.groupBy) {
                case "name": return item.name;
                case "cmc": return Math.floor(item.system.cmc || 0).toString();
                case "type": return (item.system.type_line || "Unknown").split("—")[0].trim();
                case "set": return item.system.set || "Unknown";
                case "rarity": return item.system.rarity || "Unknown";
                default: return item.name;
            }
        };

        for (const stack of strictStacks) {
            const key = getGroupKey(stack);

            if (!groupKeyMap.has(key)) {
                const groupEntry = {
                    key: key,
                    isStack: true,
                    stacks: []
                };
                groupKeyMap.set(key, groupEntry);
                logicalGroups.push(groupEntry);
            }
            groupKeyMap.get(key).stacks.push(stack);
        }

        // Post-process logic groups: If a group has only 1 stack, flatten it? 
        // User asked for "Visual Stacks" only if they group.
        // If sorting by "Name", duplicate names stack. Unique names are single.
        // If sorting by "CMC", all CMC 1 cards stack together? That might be huge.
        // The user example: "multiple versions of 'Forest' or 'Giant Growth' stacked together".
        // This implies grouping by NAME is the primary visual stack use case.
        // If I group by CMC, do I want ONE giant stack of all CMC 1 cards? Ideally yes, displayed as a cascade.

        // Flatten single-item groups to simplify template if needed, OR keep consistent structure.
        // Let's flatten if only 1 stack in group? No, consistency is better.
        // But if I have 1 Giant Growth, it shouldn't look like a "stack group" container if it's just one card.
        // Template discriminates based on `group.stacks.length > 1`.

        // Final structure for template:
        context.cards = logicalGroups.map(g => {
            if (g.stacks.length === 1) {
                return { isStack: false, item: g.stacks[0].item, quantity: g.stacks[0].quantity };
            }
            return g; // { isStack: true, stacks: [...] }
        });

        context.totalCards = rawCards.length;
        return context;
    }

    /* -------------------------------------------- */
    /*  Rendering & Reactivity                      */
    /* -------------------------------------------- */

    _onRender(context, options) {
        super._onRender(context, options);

        // Tab Handling (Standard V2 tabs are often manual or use specialized mixins, 
        // but for now we can stick to simple CSS hiding or manual listeners if needed. 
        // Actually, V1 tabs worked via `navSelector`. V2 has no default tab handler in base.
        // We will implement a simple tab switcher for now.)
        const html = this.element;

        // Manual Tab Listener (V2 way is usually via actions or custom logic)
        html.querySelector("nav.sheet-tabs").addEventListener("click", (event) => {
            const tab = event.target.closest("[data-tab]");
            if (!tab) return;
            event.preventDefault();
            this._activateTab(tab.dataset.tab);
        });

        // Activate initial tab if not set
        if (!this._activeTab) this._activateTab("binder");
        else this._activateTab(this._activeTab);

        // Filter Listeners
        // 1. Search Input (Name) - Keyup for responsive typing
        const nameInput = html.querySelector("input[name='filter-name']");
        if (nameInput) nameInput.addEventListener("keyup", this._onFilterChanged.bind(this));

        // 2. Accordion Inputs (Colors, Rarities, GroupBy) - Change Delegation
        // We can listen on the accordion content container for any change event
        const accordionContent = html.querySelector(".accordion-content");
        if (accordionContent) {
            accordionContent.addEventListener("change", this._onFilterChanged.bind(this));
        }

        // 3. Toggle Accordion Header
        const accordionHeader = html.querySelector(".accordion-header");
        if (accordionHeader) {
            accordionHeader.addEventListener("click", MTGVaultEditor._onToggleFilter.bind(this));
        }

        // 4. Double Click to View Card (Default: Image Mode)
        // Delegated listener on the form/container
        html.addEventListener("dblclick", (event) => {
            const cardEl = event.target.closest(".mtg-card");
            if (!cardEl) return;
            event.preventDefault();
            event.stopPropagation();
            const card = this.actor.items.get(cardEl.dataset.itemId);
            if (card) {
                new MTGCardViewer(card, "image").render(true);
            }
        });

        // DragDrop
        new foundry.applications.ux.DragDrop({
            dragSelector: ".mtg-card",
            dropSelector: null,
            permissions: { dragstart: this._canDragStart.bind(this), drop: this._canDragStart.bind(this) },
            callbacks: { dragstart: this._onDragStart.bind(this), drop: this._onDrop.bind(this) }
        }).bind(this.element.querySelector("form"));
    }

    _updateContext(html) {
        super._updateContext(html);
        // Clean up any lingering context menus if the editor closes/renders?
        // Actually, the menu is on body, handled by its own close listeners.
    }

    _activateTab(tabName) {
        this._activeTab = tabName;
        const html = this.element;

        // Update Nav
        html.querySelectorAll("nav.sheet-tabs .item").forEach(el => {
            el.classList.toggle("active", el.dataset.tab === tabName);
        });

        // Update Body
        html.querySelectorAll(".sheet-body .tab").forEach(el => {
            const isActive = el.dataset.tab === tabName;
            el.classList.toggle("active", isActive);
            if (isActive) el.style.display = "flex";
            else el.style.display = "none";
        });
    }

    /* -------------------------------------------- */
    /*  Action Handlers (Static in V2)              */
    /* -------------------------------------------- */

    static _onToggleFilter(event, target) {
        this.filterExpanded = !this.filterExpanded;
        this.render();
    }

    _onFilterChanged(event) {
        // Handle changes for inputs, checkboxes, radios
        const input = event.target;
        const name = input.name;
        const value = input.value;
        const checked = input.checked;

        if (!this.filters) this.filters = { name: "", colors: {}, rarities: {}, groupBy: "name" };

        if (name === "filter-name") {
            this.filters.name = value;
            foundry.utils.debounce(() => this.render(), 300)();
            return;
        }

        if (name === "filter-color") {
            // Store as object map { W: true, U: false }
            if (!this.filters.colors) this.filters.colors = {};
            if (checked) this.filters.colors[value] = true;
            else delete this.filters.colors[value];
        }

        if (name === "filter-rarity") {
            if (!this.filters.rarities) this.filters.rarities = {};
            if (checked) this.filters.rarities[value] = true;
            else delete this.filters.rarities[value];
        }

        if (name === "groupBy") {
            this.filters.groupBy = value;
        }

        this.render();
    }

    /* -------------------------------------------- */
    /*  Drag and Drop                               */
    /* -------------------------------------------- */

    _canDragStart(selector) {
        return true; // Allow dragging for all matched elements
    }

    _onDragStart(event) {
        const li = event.currentTarget;
        if ("target" in event.dataset) return; // Ignore if already processed

        const card = this.actor.items.get(li.dataset.itemId);
        if (!card) return;

        const dragData = card.toDragData();
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }

    async _onDrop(event) {
        event.preventDefault();
        const data = TextEditor.getDragEventData(event);
        if (!data) return;

        const item = await Item.implementation.fromDropData(data);
        if (!item) return;

        // 1. Check if dropping onto a DECK row -> Add card to deck
        const deckRow = event.target.closest(".deck-row");
        if (deckRow) {
            const deckId = deckRow.dataset.itemId;
            const deck = this.actor.items.get(deckId);
            if (deck && (item.type === "card" || item.type === "mtg-card")) {
                return this._addCardToDeck(deck, item);
            }
        }

        // 2. Default: Import Item into Vault (if it's not already owned)
        // Check if we are the owner of the dropped item to avoid duplication if dragging internal items?
        // Basic logic: Create the item on the actor.
        if (item.parent === this.actor) return; // Don't duplicate if dragging within same actor

        return Item.create(item.toObject(), { parent: this.actor });
    }

    async _addCardToDeck(deck, item) {
        console.log(`Adding ${item.name} to ${deck.name}`);
        const cards = foundry.utils.deepClone(deck.system.cards || { main: [], side: [], commander: [] });
        const cardData = item.toObject();
        delete cardData._id;

        // Default to mainboard for drops on the row
        if (!cards.main) cards.main = [];
        cards.main.push(cardData);

        await deck.update({ "system.cards": cards });
    }
}
