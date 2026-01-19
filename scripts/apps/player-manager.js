export class MTGPlayerManager extends Application {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "mtg-player-manager",
            title: "Manage Players",
            template: "systems/foundry-mtg/templates/apps/player-manager.html",
            width: 600, // Slightly wider for the unassigned table
            height: "auto",
            resizable: true
        });
    }

    static initHooks() {
        const refresh = () => {
            // We can't easily get the instance unless we store it globally or use a static method.
            // But we can just create a temp instance to refresh the sidebar, 
            // OR better: use a static helper if available.
            // Since we don't keep a persistent instance of the *popout*, 
            // we just want to refresh the *sidebar*.
            new MTGPlayerManager().refreshSidebar();
        };

        // React to Actor changes (created/deleted vaults)
        Hooks.on("createActor", (a) => { if (a.type === "player") refresh(); });
        Hooks.on("deleteActor", (a) => { if (a.type === "player") refresh(); });
        Hooks.on("updateActor", (a) => { if (a.type === "player") refresh(); });

        // React to User changes (assignment)
        Hooks.on("updateUser", (u) => refresh());
    }

    /**
     * Override render to also update the sidebar if it exists.
     */
    render(force, options) {
        // 1. Render the popout window ONLY if forced or already open
        if (force || this.rendered) {
            super.render(force, options);
        }

        // 2. Refresh the sidebar panel
        this.refreshSidebar();

        return this;
    }

    async refreshSidebar() {
        const sidebarAuth = game.user.isGM || game.user.role === 3; // GM or AGM
        if (!sidebarAuth) return;

        const playerSection = $("#sidebar-content #mtg-players");
        if (playerSection.length) {
            const data = await this.getData();
            const sidebarTemplate = "systems/foundry-mtg/templates/apps/player-manager-sidebar.html";
            // V13 Deprecation Fix
            const html = await foundry.applications.handlebars.renderTemplate(sidebarTemplate, data);

            playerSection.html(html);
            this.activateListeners(playerSection);
        }
    }

    getData() {
        const viewerIsGM = game.user.isGM;
        const allPlayerActors = game.actors.filter(a => a.type === "player");

        // 1. Map Users and identify their assigned actors
        const users = game.users.map(u => {
            return {
                id: u.id,
                name: u.name,
                hasCharacter: !!u.character,
                characterId: u.character?.id,
                characterName: u.character ? u.character.name : "None",
                isGM: u.isGM,
                canBeAssigned: !u.isGM && !u.character // Eligible for reassignment
            };
        });

        // 2. Identify Unassigned Actors
        const assignedActorIds = new Set(game.users.filter(u => u.character).map(u => u.character.id));
        const unassignedActors = allPlayerActors.filter(a => !assignedActorIds.has(a.id)).map(a => {
            return {
                id: a.id,
                name: a.name,
                cardsCount: a.items.size // e.g. collection size
            };
        });

        // 3. List of users eligible to receive an assignment
        const assignableUsers = users.filter(u => u.canBeAssigned);

        return { users, unassignedActors, assignableUsers, viewerIsGM };
    }

    activateListeners(html) {
        console.log("MTGPlayerManager | Activating Listeners", html.find(".create-actor").length, "buttons found");
        super.activateListeners(html);

        // Bind directly to elements to avoid delegation stacking on persistent container
        html.find(".create-actor").on("click", this._onCreateActor.bind(this));
        html.find(".unassign-actor").on("click", this._onUnassignActor.bind(this));
        html.find(".delete-actor").on("click", this._onDeleteActor.bind(this));

        // Unassigned Section Listeners
        html.find(".confirm-reassign").on("click", this._onConfirmReassign.bind(this));
    }

    async _onCreateActor(event) {
        const userId = event.currentTarget.dataset.userid;
        const user = game.users.get(userId);
        if (!user) return;
        if (user.isGM) return ui.notifications.warn("GMs cannot have a Player Vault.");

        // Create Actor
        const actorData = {
            name: `${user.name}'s Vault`,
            type: "player", // The Vault
            ownership: {
                default: 0,
                [userId]: 3 // Owner
            }
        };
        const actor = await Actor.create(actorData);

        // Assign to User
        await user.update({ character: actor.id });
        this.render();
    }

    async _onUnassignActor(event) {
        const userId = event.currentTarget.dataset.userid;
        const user = game.users.get(userId);
        if (user) {
            await user.update({ character: null });
            this.render();
        }
    }

    async _onConfirmReassign(event) {
        const row = event.currentTarget.closest("tr");
        const actorId = row.dataset.actorid;
        const select = row.querySelector("select.reassign-select");
        const userId = select.value;

        if (!userId) return ui.notifications.warn("Please select a user to reassign to.");

        const user = game.users.get(userId);
        const actor = game.actors.get(actorId);

        if (user && actor) {
            // Update User assignment
            await user.update({ character: actor.id });

            // Update Actor Ownership permissions
            const checkout = {
                default: 0,
                [user.id]: 3 // Owner
            };
            await actor.update({ ownership: checkout });

            this.render();
            ui.notifications.info(`${actor.name} reassigned to ${user.name}`);
        }
    }

    async _onDeleteActor(event) {
        if (!game.user.isGM) return;
        const actorId = event.currentTarget.dataset.actorid;
        const actor = game.actors.get(actorId);
        if (!actor) return;

        // Custom Dialog for "What to do with cards?"
        const content = `
            <p>You are about to delete <strong>${actor.name}</strong>.</p>
            <p>This Vault contains <strong>${actor.items.size}</strong> items.</p>
            <p>Are you sure?</p>
        `;

        new Dialog({
            title: "Delete Vault",
            content: content,
            buttons: {
                delete: {
                    icon: '<i class="fas fa-trash"></i>',
                    label: "Delete Forever",
                    callback: async () => {
                        console.log("MTGPlayerManager | Attempting to delete actor:", actor.name, actor.id);
                        try {
                            const result = await actor.delete();
                            console.log("MTGPlayerManager | Delete result:", result);
                            this.render();
                        } catch (err) {
                            console.error("MTGPlayerManager | Delete failed:", err);
                            ui.notifications.error("Failed to delete Vault: " + err.message);
                        }
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel"
                }
            },
            default: "cancel"
        }).render(true);
    }
}
