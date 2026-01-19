
import { MTGImporter } from "../importer.js";

export class MTGCardManager extends Application {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "mtg-card-manager",
            title: "Manage Cards",
            template: "systems/foundry-mtg/templates/apps/cards-sidebar.html", // Default to sidebar template for specific instances
            width: 400,
            height: "auto",
            resizable: true
        });
    }

    /* -------------------------------------------- */
    /*  Rendering & Data                            */
    /* -------------------------------------------- */

    render(force, options) {
        // If force is true, render the popout (maybe useful for debug, but primarily sidebar focused)
        if (force || this.rendered) {
            super.render(force, options);
        }
        this.refreshSidebar();
        return this;
    }

    async refreshSidebar() {
        const sidebarAuth = game.user.isGM || game.user.role === 3; // GM or AGM
        if (!sidebarAuth) return;

        const cardSection = $("#sidebar-content #mtg-cards");
        if (cardSection.length) {
            const data = await this.getData();
            const sidebarTemplate = "systems/foundry-mtg/templates/apps/cards-sidebar.html";
            const html = await foundry.applications.handlebars.renderTemplate(sidebarTemplate, data);

            cardSection.html(html);
            this.activateListeners(cardSection);
        }
    }

    async getData() {
        const isGM = game.user.isGM;
        const sets = game.packs
            .filter(p => p.metadata.name.startsWith("mtg-cards-"))
            .map(p => {
                const code = p.metadata.name.replace("mtg-cards-", "").toUpperCase();
                return {
                    name: p.metadata.label.replace(`MTG: ${code}`, "").trim() || p.metadata.label,
                    code: code,
                    id: p.metadata.id
                };
            })
            .sort((a, b) => a.code.localeCompare(b.code));

        return { sets, isGM };
    }

    /* -------------------------------------------- */
    /*  Listeners & Actions                         */
    /* -------------------------------------------- */

    activateListeners(html) {
        super.activateListeners(html); // Just in case

        // Bind directly to children
        html.find(".add-set").on("click", this._onAddSet.bind(this));
        html.find(".give-pack").on("click", this._onGivePack.bind(this));
        html.find(".give-cards").on("click", this._onGiveCards.bind(this));
        html.find(".delete-set").on("click", this._onDeleteSet.bind(this));
    }

    async _onAddSet(event) {
        // Open the existing Importer
        new MTGImporter().render(true);
        // Note: The importer needs to trigger a sidebar refresh when done.
        // We might need to hook into it or rely on a Hook.
    }

    async _onGivePack(event) {
        const btn = event.currentTarget;
        const setCode = btn.dataset.setcode;

        // Confirm
        const confirm = await Dialog.confirm({
            title: "Give Packs",
            content: `<p>Give a booster pack of <strong>${setCode}</strong> to all players with a Vault?</p>`
        });
        if (!confirm) return;

        // Iterate Players
        const players = game.users.filter(u => u.character);
        let count = 0;

        for (const user of players) {
            const vault = user.character;
            // Create "Pack" item
            const packData = {
                name: `Booster Pack (${setCode})`,
                type: "pack",
                img: "icons/svg/item-bag.svg", // Default image
                system: {
                    set_code: setCode.toLowerCase()
                }
            };
            await Item.create(packData, { parent: vault });
            count++;
        }

        ui.notifications.info(`Distributed ${count} packs of ${setCode}.`);
    }

    async _onGiveCards(event) {
        ui.notifications.warn("Feature 'Give Cards' is coming soon!");
    }

    async _onDeleteSet(event) {
        if (!game.user.isGM) return;
        const btn = event.currentTarget;
        const setCode = btn.dataset.setcode;
        const compendiumName = `mtg-cards-${setCode.toLowerCase()}`;
        const pack = game.packs.get(`world.${compendiumName}`);

        if (!pack) return ui.notifications.error("Compendium not found.");

        const confirm = await Dialog.confirm({
            title: "Delete Set",
            content: `
                <p>Are you sure you want to delete <strong>${pack.metadata.label}</strong>?</p>
                <p style="color:red;">This will delete the Compendium AND could break links in existing decks (though current implementation copies data, so maybe safe).</p>
                <p>This action cannot be undone.</p>
            `
        });

        if (confirm) {
            await pack.deleteCompendium();
            this.refreshSidebar();
            ui.notifications.info(`Deleted set ${setCode}.`);
        }
    }
}
