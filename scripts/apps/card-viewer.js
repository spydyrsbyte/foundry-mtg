const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class MTGCardViewer extends HandlebarsApplicationMixin(ApplicationV2) {

    constructor(item, options = {}) {
        super(options);
        this.item = item;
    }

    static DEFAULT_OPTIONS = {
        id: "mtg-card-viewer",
        tag: "div",
        classes: ["mtg", "card-viewer"],
        window: {
            title: "Card Viewer",
            icon: "fas fa-eye",
            resizable: true,
            width: 420,
            height: 650
        },
        position: {
            width: 420,
            height: "auto"
        },
        // We handle tabs manually to ensure reliability
        actions: {
            changeTab: MTGCardViewer._onChangeTab
        }
    };

    static PARTS = {
        viewer: {
            template: "systems/foundry-mtg/templates/apps/card-viewer.html"
        }
    }

    get title() {
        return `${this.item.name}`;
    }

    async _prepareContext(options) {
        return {
            item: this.item
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);

        // Initialize Tabs: Set first tab active if none are active
        const tabs = this.element.querySelectorAll(".tabs .item");
        const contents = this.element.querySelectorAll(".content .tab");

        if (tabs.length > 0 && !this.element.querySelector(".tabs .item.active")) {
            tabs[0].classList.add("active");
            const group = tabs[0].dataset.group;
            const tab = tabs[0].dataset.tab;

            // Find corresponding content
            const content = this.element.querySelector(`.content .tab[data-group="${group}"][data-tab="${tab}"]`);
            if (content) content.classList.add("active");
        }

        // Bind Click Handlers manually for maximum reliability
        tabs.forEach(t => {
            t.addEventListener("click", (ev) => {
                ev.preventDefault();
                const target = ev.currentTarget;
                const group = target.dataset.group;
                const tab = target.dataset.tab;

                // Deactivate all in group
                this.element.querySelectorAll(`.tabs .item[data-group="${group}"]`).forEach(el => el.classList.remove("active"));
                this.element.querySelectorAll(`.content .tab[data-group="${group}"]`).forEach(el => el.classList.remove("active"));

                // Activate target
                target.classList.add("active");
                const content = this.element.querySelector(`.content .tab[data-group="${group}"][data-tab="${tab}"]`);
                if (content) content.classList.add("active");
            });
        });
    }

    static _onChangeTab(event, target) {
        // Fallback action handler if we used data-action
    }
}
