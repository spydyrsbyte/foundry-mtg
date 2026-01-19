const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;
import { MTG } from "../config.js";

export class MTGTableSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["foundry-mtg", "sheet", "actor", "table"],
        window: {
            title: "MTG Table",
            icon: "fas fa-chess-board",
            resizable: true,
            controls: []
        },
        position: {
            width: 1000,
            height: 800
        },
        actions: {
            drawCard: MTGTableSheet._onDrawCard
        }
    };

    static PARTS = {
        sheet: {
            template: "systems/foundry-mtg/templates/sheets/table-sheet.html"
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const actor = this.document;

        context.system = actor.system;
        context.items = actor.items;

        const currentUserId = game.user.id;

        // Grab Playmats
        const playmats = context.items.filter(i => i.type === "playmat");

        // Prepare data for each Playmat seat
        context.seats = playmats.map(pm => {
            const data = pm.toObject();
            data.isMe = (data.system.player_id === currentUserId);

            // Calculate derived stats
            const ownerId = data.system.player_id;
            const myCards = context.items.filter(i => i.type === "card" && i.system.owner === ownerId);

            data.libraryCount = myCards.filter(c => c.system.location === "library").length;
            data.handCount = myCards.filter(c => c.system.location === "hand").length;
            data.graveCount = myCards.filter(c => c.system.location === "graveyard").length;
            data.exileCount = myCards.filter(c => c.system.location === "exile").length;

            return data;
        });

        // My Hand (Visual Cards)
        const myPlaymat = context.seats.find(s => s.system.player_id === currentUserId);
        if (myPlaymat) {
            context.myHand = context.items.filter(i =>
                i.type === "card" &&
                i.system.owner === currentUserId &&
                i.system.location === "hand"
            );
        } else {
            context.myHand = [];
        }

        return context;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        // Table sheet was simple tabs, we can replicate standard tab logic or just use V2 if manual needed
        const html = this.element;
        // ... (Tab logic if needed, but table sheet seemed to just point to 'battlefield' which might be empty)
    }

    static async _onDrawCard(event, target) {
        const app = this;
        const userId = game.user.id;
        // Find top card of library
        const library = app.document.items.filter(i =>
            i.type === "card" &&
            i.system.owner === userId &&
            i.system.location === "library"
        );

        if (library.length === 0) {
            ui.notifications.warn("Library is empty!");
            return;
        }

        const card = library[0];
        await card.update({ "system.location": "hand" });
    }
}
