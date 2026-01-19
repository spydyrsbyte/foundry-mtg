const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class MTGVoidSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["foundry-mtg", "sheet", "actor", "void"],
        window: {
            title: "Void",
            icon: "fas fa-ban",
            resizable: false,
            controls: []
        },
        position: {
            width: 400,
            height: 300
        }
    };

    static PARTS = {
        sheet: {
            template: "systems/foundry-mtg/templates/sheets/void-sheet.html" // We need a dummy template or just empty
        }
    };

    render(options) {
        // Do nothing. The HUD handles everything.
        return this;
    }
}
