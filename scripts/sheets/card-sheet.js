const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class MTGCardSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["foundry-mtg", "sheet", "item", "card"],
        window: {
            title: "MTG Card Viewer",
            icon: "fas fa-image",
            resizable: true,
            controls: []
        },
        position: {
            width: 300,
            height: "auto"
        },
        actions: {
            toggleDetails: MTGCardSheet._onToggleDetails
        }
    };

    static PARTS = {
        sheet: {
            template: "systems/foundry-mtg/templates/sheets/card-sheet.html"
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const item = this.document;

        context.system = item.system;
        context.flags = item.flags;
        context.config = CONFIG.MTG || {
            rarities: {
                "common": "Common",
                "uncommon": "Uncommon",
                "rare": "Rare",
                "mythic": "Mythic"
            }
        };

        return context;
    }

    static _onToggleDetails(event, target) {
        const app = this;
        // Basic toggle logic via CSS/JS or just re-render with state?
        // Since we are moving to V2, direct DOM manipulation like slideUp is discouraged but possible.
        // Let's stick to the previous simple logic but adapted.
        const html = app.element;
        const details = html.querySelector(".sheet-details");
        if (!details) return;

        // Simple toggle class or style
        const isHidden = details.style.display === "none";

        if (isHidden) {
            details.style.display = "block";
            app.setPosition({ height: "auto", width: 600 });
        } else {
            details.style.display = "none";
            app.setPosition({ height: "auto", width: 300 });
        }
    }
}
