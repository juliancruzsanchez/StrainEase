import SwiftUI

struct StrainDetailView: View {
    @Environment(\.strainAPI) private var api
    @State private var profile: StrainProfile
    @State private var isHydrating: Bool
    @State private var activeTerpene: String?
    @State private var familyStrains: [StrainProfile] = []
    @State private var isLoadingFamily = false
    @State private var tailoredDescription: StrainDescription?
    @State private var isLoadingTailoredDescription = false
    @State private var tailoredLoadingMessageIndex = 0
    @State private var tailoredLoadingRotationTask: Task<Void, Never>?
    @Environment(SavedStrainsStore.self) private var saved
    @Environment(SavedAilmentsStore.self) private var ailments
    @Environment(SavedMedicationsStore.self) private var medications
    @Environment(RecentlyViewedStore.self) private var recents
    @Environment(ReliefLogStore.self) private var relief
    @Environment(AppNavigation.self) private var nav
    @Environment(CompareSelectionStore.self) private var compareStore

    init(profile: StrainProfile) {
        _profile = State(initialValue: profile)
        _isHydrating = State(initialValue: !profile.pendingHydrationSections.isEmpty)
    }

    private var score: Int { StrainMeaning.dayNightScore(profile) }
    private var isLiked: Bool { saved.isSaved(profile.slug) }
    private var isInCompare: Bool { compareStore.isIn(profile.name) }
    private var compareAtCap: Bool { compareStore.atCap }
    private var pending: Set<StrainHydrationSection> {
        isHydrating ? profile.pendingHydrationSections : []
    }

    var body: some View {
        ZStack {
            MeshBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    descriptionSection
                    if pending.contains(.dayNight) {
                        hydratingSection(.dayNight)
                    } else {
                        dayNight
                    }
                    if let uses = profile.medicalUses, !uses.isEmpty {
                        chipSection("Reported uses", items: uses)
                    } else if pending.contains(.uses) {
                        hydratingSection(.uses)
                    }
                    if let effects = profile.effects, !effects.isEmpty {
                        effectsSection(effects)
                    } else if pending.contains(.effects) {
                        hydratingSection(.effects)
                    }
                    if let terpenes = profile.terpenes, !terpenes.isEmpty {
                        terpenesSection(terpenes)
                    } else if pending.contains(.terpenes) {
                        hydratingSection(.terpenes)
                    }
                    ShopLinksView(profile: profile)
                    if let sides = profile.sideEffects, !sides.isEmpty {
                        chipSection("Watch for", items: sides)
                    } else if pending.contains(.sideEffects) {
                        hydratingSection(.sideEffects)
                    }
                    TriedNotesView(profile: profile)
                    ReliefLogForm(strainName: profile.name, conditions: ailments.ailments)
                    ReliefHistoryList(logs: relief.logs(for: profile.name))
                    SharedNotesView(strainKey: profile.slug)

                    CommunityVoicesSection(
                        profile: profile,
                        isHydrating: pending.contains(.community)
                    )
                    if !profile.inKnowledgeBase && !isHydrating {
                        missing
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 48)
            }
        }
        .navigationTitle(profile.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                CompareToggleButton(
                    isInSelection: isInCompare,
                    atCap: compareAtCap
                ) {
                    compareStore.toggle(profile.name)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await saved.toggle(profile) }
                } label: {
                    Image(systemName: isLiked ? "heart.fill" : "heart")
                        .foregroundStyle(isLiked ? Palette.primary : Palette.mutedForeground)
                        .symbolEffect(.bounce, value: isLiked)
                }
                .accessibilityLabel(isLiked ? "Remove from liked strains" : "Add to liked strains")
                .disabled(saved.isBusy)
                .sensoryFeedback(.selection, trigger: isLiked)
            }
        }
        .task(id: profile.slug) {
            recents.record(profile)
            await hydrate()
        }
        .task(id: profile.slug) {
            await fetchTailoredDescription()
        }
        .onChange(of: ailments.ailments) { _, _ in
            Task { await fetchTailoredDescription() }
        }
    }

    /// The visible description block. Prefers the patient-tailored
    /// three-section AI writeup when the user has saved ailments;
    /// otherwise falls back to the static `profile.description`; while
    /// the tailored fetch is in flight for the first time we keep
    /// showing the static description so the section never blanks.
    @ViewBuilder
    private var descriptionSection: some View {
        if let tailored = tailoredDescription {
            tailoredDescriptionSection(tailored)
        } else if isLoadingTailoredDescription {
            tailoredDescriptionLoading
        } else if let description = profile.description, !description.isEmpty {
            SWCard {
                Text(description)
                    .font(.system(size: 16))
                    .foregroundStyle(Palette.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else if pending.contains(.description) {
            hydratingSection(.description)
        }
    }

    private var tailoredDescriptionLoading: some View {
        SWCard {
            HStack(spacing: 10) {
                ProgressView()
                    .tint(Palette.primary)
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 11, weight: .semibold))
                    Text(Self.tailoredLoadingMessages[tailoredLoadingMessageIndex])
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Palette.foreground)
                }
            }
        }
        .accessibilityIdentifier("strain.tailored-description.loading")
        .accessibilityLabel(Self.tailoredLoadingMessages[tailoredLoadingMessageIndex])
    }

    /// Status messages rotated while the tailored description is being
    /// generated. Mirrors the web `TAILORED_LOADING_MESSAGES` so both
    /// surfaces stay in step.
    static let tailoredLoadingMessages = [
        "Loading strain data…",
        "Cross referencing your symptoms…",
        "Analyzing medications…",
        "Looking at past strain experiences…",
        "Almost done…",
    ]

    /// How long each status message stays on screen. Matches the web
    /// `ROTATE_INTERVAL_MS` (1.6s) so a patient reading both surfaces
    /// sees the same cadence.
    private static let tailoredLoadingRotationSeconds: UInt64 = 1_600_000_000

    private func tailoredDescriptionSection(_ description: StrainDescription) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .font(.system(size: 11, weight: .semibold))
                Text("Tailored to your symptoms")
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(1.0)
                    .textCase(.uppercase)
            }
            .foregroundStyle(Palette.primary)

            ForEach(description.sections, id: \.heading) { section in
                TailoredDescriptionSection(
                    section: section,
                    profile: profile,
                    ailments: ailments.ailments,
                    medications: medications.names,
                    reliefHistory: relief.summary
                )
            }
        }
        .accessibilityIdentifier("strain.tailored-description")
    }

    /// Fetch the patient-tailored description. We always call the
    /// endpoint on appear — the backend returns a general three-section
    /// write-up when the user has no saved ailments, so this drives the
    /// same three-card surface for every reader, not just patients with
    /// stored ailments. The local feature stub short-circuits with
    /// `nil` when ailments are empty (so we don't show a skeleton) but
    /// the live call always runs.
    private func fetchTailoredDescription() async {
        isLoadingTailoredDescription = true
        startTailoredLoadingRotation()
        defer {
            isLoadingTailoredDescription = false
            stopTailoredLoadingRotation()
        }
        do {
            let result = try await api.describe(
                strain: profile,
                ailments: ailments.ailments,
                medications: medications.names,
                reliefHistory: relief.summary,
                language: StrainAILanguage.preferred
            )
            tailoredDescription = result
        } catch {
            // Keep the static `profile.description` showing on failure.
            tailoredDescription = nil
        }
    }

    /// Reset to the first message and start cycling through
    /// `tailoredLoadingMessages` while the fetch is in flight.
    private func startTailoredLoadingRotation() {
        tailoredLoadingRotationTask?.cancel()
        tailoredLoadingMessageIndex = 0
        let total = Self.tailoredLoadingMessages.count
        let interval = Self.tailoredLoadingRotationSeconds
        tailoredLoadingRotationTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: interval)
                if Task.isCancelled { return }
                await MainActor.run {
                    tailoredLoadingMessageIndex =
                        (tailoredLoadingMessageIndex + 1) % total
                }
            }
        }
    }

    private func stopTailoredLoadingRotation() {
        tailoredLoadingRotationTask?.cancel()
        tailoredLoadingRotationTask = nil
        tailoredLoadingMessageIndex = 0
    }

    private func hydrate() async {
        isHydrating = !profile.pendingHydrationSections.isEmpty
        defer { isHydrating = false }
        do {
            guard var full = try await api.search(name: profile.name, conditions: ailments.ailments) else { return }
            // Backend often omits imageUrl. Keep the local nug shot, then
            // fill from the catalog so every Home rail (not just recents)
            // still shows a photo after hydrate.
            if (full.imageUrl?.isEmpty ?? true),
               let local = profile.imageUrl,
               !local.isEmpty {
                full.imageUrl = local
            }
            full = StrainCatalog.applyingCatalogPhoto(full)
            profile = full
            recents.record(full)
        } catch {
            // Keep the stub / cached profile if Leafly is unreachable.
        }
    }

    private func hydratingSection(_ section: StrainHydrationSection) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(section.title)
            SWCard {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        ProgressView()
                            .tint(Palette.primary)
                        Text(section.caption)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Palette.mutedForeground)
                    }
                    ForEach(0..<section.placeholderLines, id: \.self) { index in
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(Palette.muted)
                            .frame(height: 12)
                            .frame(maxWidth: index == section.placeholderLines - 1 ? 180 : .infinity)
                    }
                }
            }
        }
        .accessibilityIdentifier("strain.hydrating.\(section.rawValue)")
        .accessibilityLabel("Loading \(section.title)")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            StrainPhoto(
                urlString: profile.imageUrl,
                type: profile.type,
                height: 248,
                cornerRadius: 20
            )
            HStack(spacing: 8) {
                TypeBadge(type: profile.type)
                if !profile.inKnowledgeBase {
                    Text("AI researched")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Palette.primary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Palette.accent, in: Capsule())
                }
            }
            Text(profile.name)
                .font(.system(.largeTitle, design: .serif))
                .foregroundStyle(Palette.foreground)
            if !profile.subtitle.isEmpty {
                Text(profile.subtitle)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Palette.mutedForeground)
            }
            if let lineage = profile.lineage, !lineage.isEmpty {
                Text(lineage)
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.mutedForeground)
            } else if pending.contains(.lineage) {
                HStack(spacing: 8) {
                    ProgressView()
                        .tint(Palette.primary)
                        .controlSize(.mini)
                    Text(StrainHydrationSection.lineage.caption)
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.mutedForeground)
                }
                .accessibilityIdentifier("strain.hydrating.lineage")
                .accessibilityLabel("Loading Lineage")
            }
        }
    }

    private var dayNight: some View {
        SWCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Label("Day", systemImage: "sun.max")
                    Spacer()
                    Label("Night", systemImage: "moon")
                }
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Palette.mutedForeground)
                .labelStyle(.titleAndIcon)
                .symbolRenderingMode(.hierarchical)

                GeometryReader { geo in
                    let x = geo.size.width * CGFloat(100 - score) / 100
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(
                                LinearGradient(
                                    // sky-300 → sky-500 → indigo-900 to match
                                    // the web Strain.tsx day/night gradient
                                    // (Tailwind v4 oklch → sRGB).
                                    colors: [
                                        Color(red: 0.49, green: 0.83, blue: 0.99),
                                        Color(red: 0.05, green: 0.65, blue: 0.91),
                                        Color(red: 0.19, green: 0.18, blue: 0.51),
                                    ],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(height: 8)
                        Circle()
                            .fill(Palette.card)
                            .overlay(Circle().strokeBorder(Palette.foreground.opacity(0.35), lineWidth: 1.5))
                            .frame(width: 16, height: 16)
                            .offset(x: max(0, min(geo.size.width - 16, x - 8)))
                    }
                }
                .frame(height: 16)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Day to night rating")
                .accessibilityValue("\(score) out of 100 toward daytime")

                Text(StrainMeaning.dayNightLabel(score))
                    .font(.system(size: 14))
                    .foregroundStyle(Palette.mutedForeground)
            }
        }
    }

    private func chipSection(_ title: String, items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel(title)
            FlowLayout(spacing: 8) {
                ForEach(items, id: \.self) { item in
                    Text(item)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Palette.foreground)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(Palette.card, in: Capsule())
                        .overlay(Capsule().strokeBorder(Palette.border, lineWidth: 1))
                }
            }
        }
    }

    private func effectsSection(_ effects: [StrainEffect]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Effects")
            SWCard {
                VStack(spacing: 12) {
                    ForEach(effects, id: \.name) { effect in
                        HStack {
                            Text(effect.name)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Palette.foreground)
                            Spacer()
                            IntensityBar(value: effect.intensity)
                        }
                    }
                }
            }
        }
    }

    private func terpenesSection(_ terpenes: [Terpene]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Terpenes")
            VStack(spacing: 10) {
                ForEach(terpenes, id: \.name) { terpene in
                    TerpeneRow(terpene: terpene) {
                        openTerpene(terpene.name)
                    }
                }
            }
        }
        .sheet(item: Binding(
            get: { activeTerpene.flatMap(ActiveTerpene.init) },
            set: { activeTerpene = $0?.name }
        )) { active in
            TerpeneDetailView(
                name: active.name,
                profile: TerpeneCatalog.profile(for: active.name) ?? TerpeneProfile(
                    summary: "Listed on this strain.",
                    description: "",
                    characteristics: [],
                    benefits: []
                ),
                familyStrains: familyStrains,
                onSelectStrain: { selected in
                    activeTerpene = nil
                    navigateToStrain(selected)
                }
            )
        }
    }

    private func openTerpene(_ name: String) {
        guard TerpeneCatalog.isCurated(name) else { return }
        activeTerpene = name
        if familyStrains.isEmpty && !isLoadingFamily {
            loadTerpeneFamily(for: name)
        }
    }

    private func loadTerpeneFamily(for name: String) {
        isLoadingFamily = true
        Task {
            defer { isLoadingFamily = false }
            do {
                let popular = try await api.popular()
                let target = name.lowercased()
                let matching = StrainCatalog.applyingCatalogPhotos(popular)
                    .filter { strain in
                        let names = (strain.terpenes ?? []).map { $0.name.lowercased() }
                        return names.contains(target)
                    }
                familyStrains = matching
            } catch {
                // Leafly unreachable; leave family empty so the sheet
                // shows the "no popular strains" copy.
            }
        }
    }

    private func navigateToStrain(_ strain: StrainProfile) {
        // The strain detail lives inside Home's NavigationStack, so
        // push onto the active path via the AppNavigation helper.
        nav.requestOpenProfile(strain)
    }

    private var missing: some View {
        SWCard {
            VStack(alignment: .leading, spacing: 6) {
                Text("Not in the knowledge base")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Palette.foreground)
                Text("Leafly and Weedmaps didn’t return a full profile. The AI still researched this name from public sources — treat numbers as commonly reported, not lab-verified.")
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

private struct CommunityVoicesSection: View {
    let profile: StrainProfile
    var isHydrating = false

    private enum Tab: String, Hashable {
        case reddit
        case sites
    }

    @State private var selected: Tab = .sites

    private var quotes: [CommunityNote] { profile.quoteNotes }
    private var rating: (stars: Double, count: Int?)? { profile.resolvedLeaflyRating }

    private var redditNotes: [CommunityNote] {
        quotes.filter { $0.resolvedKind == "reddit" }
    }

    /// Leafly written reviews + Weedmaps blurbs + anything else the
    /// backend tagged as a non-Reddit community source. Patients get
    /// one "Weed sites" tab instead of three.
    private var siteNotes: [CommunityNote] {
        quotes.filter { $0.resolvedKind != "reddit" }
    }

    private var hasReddit: Bool { !redditNotes.isEmpty }
    private var hasSites: Bool { !siteNotes.isEmpty }

    var body: some View {
        Group {
            if rating != nil || !quotes.isEmpty || isHydrating {
                content
            }
        }
        .onAppear {
            // Auto-pick whichever tab actually has content so the user
            // doesn't open the page to an empty pane. If only one tab
            // exists, we don't render the picker at all.
            if hasReddit && !hasSites { selected = .reddit }
            else if !hasReddit && hasSites { selected = .sites }
        }
        .onChange(of: quotes) { _, newQuotes in
            let reddit = newQuotes.filter { $0.resolvedKind == "reddit" }
            let sites = newQuotes.filter { $0.resolvedKind != "reddit" }
            if selected == .reddit && reddit.isEmpty && !sites.isEmpty {
                selected = .sites
            } else if selected == .sites && sites.isEmpty && !reddit.isEmpty {
                selected = .reddit
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Community voices")
            if let rating {
                LeaflyRatingCard(stars: rating.stars, count: rating.count)
            }
            if hasReddit && hasSites {
                tabPicker
            }
            if isHydrating && quotes.isEmpty {
                SWCard {
                    HStack(spacing: 10) {
                        ProgressView()
                            .tint(Palette.primary)
                        Text("Pulling Leafly reviews and Reddit comments…")
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.mutedForeground)
                    }
                }
            }
            notesForSelectedTab
        }
    }

    private var tabPicker: some View {
        HStack(spacing: 8) {
            tabButton(.reddit, label: "Reddit", count: redditNotes.count)
            tabButton(.sites, label: "Weed sites", count: siteNotes.count)
        }
    }

    private func tabButton(_ tab: Tab, label: String, count: Int) -> some View {
        let isActive = selected == tab
        return Button {
            selected = tab
        } label: {
            HStack(spacing: 6) {
                Text(label)
                    .font(.system(size: 13, weight: .semibold))
                Text("\(count)")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(isActive ? Palette.primaryForeground.opacity(0.7) : Palette.mutedForeground)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule().fill(
                            isActive
                                ? Palette.primaryForeground.opacity(0.18)
                                : Palette.muted.opacity(0.6)
                        )
                    )
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .foregroundStyle(isActive ? Palette.primaryForeground : Palette.foreground)
            .background(
                Capsule().fill(isActive ? Palette.primary : Palette.card)
            )
            .overlay(
                Capsule().strokeBorder(
                    isActive ? Color.clear : Palette.border,
                    lineWidth: 1
                )
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(label) tab, \(count) quotes")
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }

    @ViewBuilder
    private var notesForSelectedTab: some View {
        let notes = selected == .reddit ? redditNotes : siteNotes
        if notes.isEmpty {
            // Auto-jump to whichever tab has content. With both empty
            // we drop through and render the existing hydrating card.
            if selected == .reddit && hasSites {
                emptyTabPlaceholder(text: "No Reddit quotes yet.")
            } else if selected == .sites && hasReddit {
                emptyTabPlaceholder(text: "No weed-site reviews yet.")
            } else {
                EmptyView()
            }
        } else {
            ForEach(notes) { note in
                SWCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(note.source.uppercased())
                            .font(.system(size: 10, weight: .semibold))
                            .tracking(1.2)
                            .foregroundStyle(Palette.primary)
                        Text("“\(note.text)”")
                            .font(.system(.body, design: .serif))
                            .foregroundStyle(Palette.foreground)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    private func emptyTabPlaceholder(text: String) -> some View {
        SWCard {
            Text(text)
                .font(.system(size: 13))
                .foregroundStyle(Palette.mutedForeground)
        }
    }
}

private struct LeaflyRatingCard: View {
    let stars: Double
    let count: Int?

    var body: some View {
        SWCard {
            HStack(spacing: 14) {
                HStack(spacing: 3) {
                    ForEach(0..<5, id: \.self) { index in
                        let fill = min(1, max(0, stars - Double(index)))
                        Image(systemName: fill >= 0.75 ? "star.fill" : fill >= 0.25 ? "star.leadinghalf.filled" : "star")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Palette.primary)
                    }
                }
                .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text(stars, format: .number.precision(.fractionLength(1)))
                        .font(.system(size: 22, weight: .semibold, design: .rounded))
                        .foregroundStyle(Palette.foreground)
                    Text(countLabel)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Palette.mutedForeground)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(accessibilityLabel)
        }
    }

    private var countLabel: String {
        if let count {
            return "\(count.formatted()) Leafly reviews"
        }
        return "Average Leafly rating"
    }

    private var accessibilityLabel: String {
        let rating = String(format: "%.1f", stars)
        if let count {
            return "Leafly rating \(rating) from \(count.formatted()) reviews"
        }
        return "Leafly rating \(rating)"
    }
}

/// One card per section of the tailored description. The card shows
/// the section's heading + body, plus an ✨ Ask Maya button on the
/// right that calls `elaborateSection` and renders the deeper take
/// below the original body. Mirrors the web `AskMayaButton`.
private struct TailoredDescriptionSection: View {
    @Environment(\.strainAPI) private var api
    let section: StrainDescriptionSection
    let profile: StrainProfile
    let ailments: [String]
    let medications: [String]
    let reliefHistory: String

    @State private var isOpen: Bool = false
    @State private var isLoading: Bool = false
    @State private var elaboration: String?
    @State private var errorMessage: String?

    var body: some View {
        SWCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 8) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(section.heading)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Palette.foreground)
                    }
                    Spacer(minLength: 8)
                    askMayaButton
                }
                tailoredDescriptionBody(section.body)
                if isOpen {
                    elaborationBlock
                }
            }
        }
        .accessibilityIdentifier("strain.tailored-description.\(slugify(section.heading))")
    }

    @ViewBuilder
    private var elaborationBlock: some View {
        if let elaboration {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 10, weight: .semibold))
                    Text("Maya's take")
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(1.0)
                        .textCase(.uppercase)
                }
                .foregroundStyle(Palette.primary)

                Text(elaboration)
                    .font(.system(size: 14))
                    .foregroundStyle(Palette.foreground)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(10)
            .background(
                Palette.accent.opacity(0.45),
                in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
        } else if let errorMessage {
            Text(errorMessage)
                .font(.system(size: 12))
                .foregroundStyle(Palette.mutedForeground)
        }
    }

    private var askMayaButton: some View {
        Button {
            Task { await toggle() }
        } label: {
            HStack(spacing: 4) {
                if isLoading {
                    ProgressView()
                        .controlSize(.mini)
                        .tint(Palette.primary)
                } else {
                    Image(systemName: "sparkles")
                        .font(.system(size: 10, weight: .semibold))
                }
                Text(isLoading ? "Asking Maya…" : (isOpen ? "Hide" : "Ask Maya"))
                    .font(.system(size: 11, weight: .semibold))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .foregroundStyle(Palette.primary)
            .background(Palette.accent.opacity(0.85), in: Capsule())
            .overlay(
                Capsule().strokeBorder(Palette.primary.opacity(0.35), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .disabled(isLoading)
        .accessibilityLabel(
            isOpen
                ? "Hide \(section.heading) elaboration"
                : "Ask Maya about \(section.heading)"
        )
    }

    private func toggle() async {
        if isOpen {
            withAnimation(.snappy(duration: 0.22)) { isOpen = false }
            return
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let text = try await api.elaborate(
                strain: profile,
                sectionHeading: section.heading,
                sectionBody: section.body,
                ailments: ailments,
                medications: medications,
                reliefHistory: reliefHistory,
                language: StrainAILanguage.preferred
            )
            elaboration = text
            withAnimation(.snappy(duration: 0.22)) { isOpen = true }
        } catch {
            errorMessage = "Maya couldn't expand on this right now."
            withAnimation(.snappy(duration: 0.22)) { isOpen = true }
        }
    }

    private func slugify(_ value: String) -> String {
        value.lowercased().replacingOccurrences(of: " ", with: "-")
    }

    /// Render the section body as a stack of short paragraphs so the
    /// description reads with breathing room on a phone instead of as a
    /// wall of text. The model separates paragraphs with blank lines
    /// ("\n\n"); we trim each chunk and drop empties so a stray blank
    /// doesn't add a phantom paragraph.
    @ViewBuilder
    private func tailoredDescriptionBody(_ body: String) -> some View {
        let paragraphs = body
            .components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        if paragraphs.isEmpty {
            // Model returned no blank lines. Fall back to the raw body
            // so we never render an empty section silently.
            Text(body)
                .font(.system(size: 15))
                .foregroundStyle(Palette.foreground)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(paragraphs.enumerated()), id: \.offset) { _, paragraph in
                    Text(paragraph)
                        .font(.system(size: 15))
                        .foregroundStyle(Palette.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

#Preview("Hydrating stub") {
    NavigationStack {
        StrainDetailView(profile: StrainProfile(
            name: "Green Crack",
            inKnowledgeBase: true,
            type: .sativa,
            thcRange: "15–25%"
        ))
    }
    .environment(\.strainAPI, DelayedPreviewAPI())
    .environment(SavedStrainsStore.preview())
    .environment(SavedAilmentsStore.preview())
    .environment(RecentlyViewedStore.preview())
    .environment(ReliefLogStore.preview())
    .environment(AuthSession.previewSignedIn)
    .environment(CompareSelectionStore())
}

#Preview("Granddaddy Purple") {
    NavigationStack {
        StrainDetailView(profile: .sampleGDP)
    }
    .environment(\.strainAPI, PreviewStrainAPI())
    .environment(SavedStrainsStore.preview())
    .environment(SavedAilmentsStore.preview(["Insomnia"]))
    .environment(RecentlyViewedStore.preview())
    .environment(ReliefLogStore.preview([.sampleSleep]))
    .environment(AuthSession.previewSignedIn)
    .environment(CompareSelectionStore())
}

private struct ActiveTerpene: Identifiable, Hashable {
    let name: String
    var id: String { name.lowercased() }
}

private struct TerpeneRow: View {
    let terpene: Terpene
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            SWCard {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(terpene.name)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Palette.foreground)
                        Spacer(minLength: 0)
                        if TerpeneCatalog.isCurated(terpene.name) {
                            HStack(spacing: 4) {
                                Text("Details")
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundStyle(Palette.primary)
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(Palette.primary)
                            }
                        }
                    }
                    if let meaning = StrainMeaning.terpeneMeaning(terpene.name) {
                        Text(meaning)
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.mutedForeground)
                            .fixedSize(horizontal: false, vertical: true)
                    } else if !terpene.profile.isEmpty {
                        Text(terpene.profile)
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.mutedForeground)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(!TerpeneCatalog.isCurated(terpene.name))
    }
}

#Preview("Liked · Dark") {
    NavigationStack {
        StrainDetailView(profile: .sampleGDP)
    }
    .environment(\.strainAPI, PreviewStrainAPI())
    .environment(SavedStrainsStore.preview(["granddaddy-purple"]))
    .environment(SavedAilmentsStore.preview())
    .environment(RecentlyViewedStore.preview())
    .environment(ReliefLogStore.preview())
    .environment(AuthSession.previewSignedIn)
    .environment(AppNavigation())
    .environment(CompareSelectionStore())
    .preferredColorScheme(.dark)
}
