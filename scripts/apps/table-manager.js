export class MTGTableManager extends Application {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "mtg-table-manager",
            title: "Manage Tables",
            template: "systems/foundry-mtg/templates/apps/table-manager.html",
            width: 400,
            height: "auto",
            resizable: true
        });
    }

    getData() {
        const tables = game.scenes.map(s => {
            return {
                id: s.id,
                name: s.name,
                active: s.active
            };
        });
        return { tables };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find(".create-table").click(this._onCreateTable.bind(this));
        html.find(".open-table").click(ev => {
            const tableId = ev.currentTarget.dataset.id;
            game.scenes.get(tableId).view();
        });
        html.find(".activate-table").click(ev => {
            const tableId = ev.currentTarget.dataset.id;
            game.scenes.get(tableId).activate();
        });
    }

    async _onCreateTable(event) {
        await Scene.create({
            name: "New Table",
            grid: { type: 0 }, // Gridless
            navigation: false // Hide from nav bar (optional, since we have checking logic)
        });
        this.render();
    }
}
