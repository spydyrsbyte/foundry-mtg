export class MTGJoinTable extends Application {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "mtg-join-table",
            title: "Join Table",
            template: "systems/foundry-mtg/templates/apps/join-table.html",
            width: 400,
            height: "auto",
            resizable: false
        });
    }

    getData() {
        const user = game.user;
        const vault = user.character; // The Player Actor (Vault)
        const hasVault = !!vault && vault.type === "player";

        // Mock decks for now if vault has none structure, or pull from active_decks
        // Assuming active_decks is an array of { name: "Deck Name", id: "uuid", ... }
        let decks = [];
        if (hasVault) {
            decks = vault.system.active_decks || [];
        }

        return {
            hasVault,
            vaultName: vault?.name,
            decks
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find(".join-btn").click(this._onJoin.bind(this));

        // Tab switching logic (Vault vs Import)
        html.find(".tab-link").click(ev => {
            const tab = ev.currentTarget.dataset.tab;
            html.find(".tab-content").hide();
            html.find(`.tab-content[data-tab="${tab}"]`).show();
            html.find(".tab-link").removeClass("active");
            $(ev.currentTarget).addClass("active");
        });
    }

    async _onJoin(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const type = button.dataset.type; // 'vault' or 'import'
        const form = button.closest("form");

        let deckData = null;

        if (type === "vault") {
            // Get selected deck from dropdown
            const deckId = form.querySelector("#vault-deck-select").value;
            // TODO: Load deck data from Vault actor
            console.log("Loading deck from vault:", deckId);
            // logic to find deck in vault.system.active_decks
        } else {
            // Import from text/JSON
            const text = form.querySelector("#import-deck-text").value;
            if (!text) return ui.notifications.warn("Please paste a deck list.");
            deckData = this._parseDeckText(text);
        }

        await this._spawnPlaneswalker(deckData);
        this.close();
    }

    _parseDeckText(text) {
        // Simple line parser for now: "4 Llanowar Elves"
        // Return array of { name, count }
        // This will need the Importer logic later
        return [];
    }

    async _spawnPlaneswalker(deckData) {
        // 1. Create Planeswalker Actor (Temporary)
        // actually, we might just want to spawn a Token from a "Template" actor, 
        // OR create a new Actor and then Drag it?
        // Foundry best practice for "Temp Characters": Create a real Actor, put it in a folder "Table Guests", give ownership.

        const actor = await Actor.create({
            name: game.user.name,
            type: "planeswalker",
            img: "icons/svg/mystery-man.svg",
            system: {
                life: { value: 20, max: 20 },
                color: "#ffffff" // TODO: Pick color
            },
            permission: {
                default: 0,
                [game.user.id]: 3
            }
        });

        // 2. Spawn Token
        // Center of screen
        const scene = game.scenes.active;
        if (!scene) return;

        // TODO: Populate Actor with Deck Items (deckData)

        const tokenData = await actor.getTokenDocument({
            x: scene.dimensions.width / 2,
            y: scene.dimensions.height / 2,
            actorLink: true // Link it so life updates persist to the actor we just made
        });

        await scene.createEmbeddedDocuments("Token", [tokenData]);

        ui.notifications.info("Planeswalker Spawned!");
    }
}
