import Foundation

extension StrainProfile {
    static let sampleGDP = StrainProfile(
        name: "Granddaddy Purple",
        inKnowledgeBase: true,
        type: .indica,
        thcRange: "17–23%",
        cbdRange: "<1%",
        lineage: "Purple Urkle × Big Bud",
        terpenes: [
            Terpene(name: "Myrcene", profile: "Earthy grape"),
            Terpene(name: "Caryophyllene", profile: "Pepper"),
            Terpene(name: "Pinene", profile: "Pine"),
        ],
        medicalUses: ["Insomnia", "Chronic pain", "Stress"],
        effects: [
            StrainEffect(name: "Relaxed", intensity: 5),
            StrainEffect(name: "Sleepy", intensity: 4),
            StrainEffect(name: "Happy", intensity: 3),
        ],
        sideEffects: ["Dry mouth", "Dry eyes"],
        description: "A classic indica known for grape-scented body calm that helps patients ease into sleep.",
        communityNotes: [
            CommunityNote(source: "Leafly review · sleepseeker", text: "Two hits and my back finally quieted down enough to sleep."),
            CommunityNote(source: "Reddit · r/trees", text: "GDP knocks me out in the best way after a long pain day."),
        ],
        leaflyRating: 4.5,
        leaflyReviewCount: 3201
    )

    static let sampleBlueDream = StrainProfile(
        name: "Blue Dream",
        inKnowledgeBase: true,
        type: .hybrid,
        thcRange: "17–24%",
        cbdRange: "<1%",
        lineage: "Blueberry × Haze",
        terpenes: [
            Terpene(name: "Myrcene", profile: "Earthy"),
            Terpene(name: "Pinene", profile: "Pine"),
        ],
        medicalUses: ["Chronic pain", "Depression", "Stress"],
        effects: [
            StrainEffect(name: "Uplifted", intensity: 4),
            StrainEffect(name: "Relaxed", intensity: 3),
            StrainEffect(name: "Creative", intensity: 3),
        ],
        sideEffects: ["Dry mouth"],
        description: "A balanced hybrid patients often reach for when they need relief without being glued to the couch.",
        communityNotes: [
            CommunityNote(source: "Leafly review · daytime", text: "Keeps me functional for chronic pain without gluing me to the couch."),
        ],
        leaflyRating: 4.3,
        leaflyReviewCount: 14919
    )
}

extension StrainComparison {
    static let sample = StrainComparison(
        strains: [.sampleGDP, .sampleBlueDream],
        analysis: StrainAnalysis(
            headline: "GDP is the calmer night pick.",
            summary: "Granddaddy Purple is heavier for sleep. Blue Dream stays useful if you also need daytime function.",
            forCondition: ConditionPick(
                best: "Granddaddy Purple",
                why: "Stronger sleep reports.",
                runnerUp: "Blue Dream"
            ),
            keyDifferences: ["GDP is more sedating", "Blue Dream is more daytime-friendly"],
            commonGround: ["Both show up in pain and stress reports"],
            cautions: ["Start low", "Talk to your clinician"]
        ),
        resultId: "preview-compare"
    )
}

extension RecommendationResult {
    static let sample = RecommendationResult(
        headline: "Granddaddy Purple is the calmer night pick.",
        summary: "For insomnia with an evening window, a heavier indica is the safer first try. Blue Dream stays on the list if you also need daytime function.",
        recommendations: [
            StrainRecommendation(
                strainName: "Granddaddy Purple",
                reason: "Patients consistently report body heaviness and easier sleep onset.",
                bestFor: "Evening wind-down when pain is also in the mix",
                caution: "Start low — it can be stronger than it smells."
            ),
            StrainRecommendation(
                strainName: "Blue Dream",
                reason: "Gentler hybrid that still shows up in pain and stress reports.",
                bestFor: "Patients who also need to function the next morning",
                caution: "Some people find the Haze side a bit racy at night."
            ),
        ],
        strains: [.sampleGDP, .sampleBlueDream],
        resultId: "preview"
    )
}
