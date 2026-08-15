import XCTest
@testable import StrainWise

final class StrainWiseTests: XCTestCase {
    func testFirebaseAppIDIsIOSNotWeb() {
        XCTAssertTrue(
            FirebaseBootstrap.googleAppID.contains(":ios:"),
            "iOS SDK crashes on launch if GOOGLE_APP_ID is a web app id"
        )
        XCTAssertFalse(FirebaseBootstrap.googleAppID.contains(":web:"))
    }

    func testSlugify() {
        XCTAssertEqual(StrainProfile(name: "Granddaddy Purple", inKnowledgeBase: true).slug, "granddaddy-purple")
        XCTAssertEqual(StrainProfile(name: "  OG Kush  ", inKnowledgeBase: true).slug, "og-kush")
    }

    func testCompactPrefsDropsDefaults() {
        var prefs = ResearchPrefs()
        XCTAssertTrue(prefs.compacted().isEmpty)

        prefs.timeOfDay = .night
        prefs.thcSensitivity = .anxiousHighThc
        prefs.patientNote = "  sleep by 10  "
        prefs.ownedStrainsText = "Blue Dream, Gelato"
        let compact = prefs.compacted()
        XCTAssertEqual(compact["timeOfDay"] as? String, "night")
        XCTAssertEqual(compact["thcSensitivity"] as? String, "anxious-high-thc")
        XCTAssertEqual(compact["patientNote"] as? String, "sleep by 10")
        XCTAssertEqual(compact["ownedStrains"] as? [String], ["Blue Dream", "Gelato"])
        XCTAssertNil(compact["consumeForm"])
    }

    func testDayNightScoreIndicaLeansNight() {
        let score = StrainMeaning.dayNightScore(.sampleGDP)
        XCTAssertLessThanOrEqual(score, 35)
        XCTAssertEqual(StrainMeaning.dayNightLabel(score), "Better as an evening strain")
    }

    @MainActor
    func testCanLookupRequiresNonEmptyQuery() {
        let model = FindModel(api: PreviewStrainAPI())
        XCTAssertFalse(model.canLookup)
        model.lookupQuery = "   "
        XCTAssertFalse(model.canLookup)
        model.lookupQuery = "Blue Dream"
        XCTAssertTrue(model.canLookup)
    }

    @MainActor
    func testPreviewSavedStoreTogglesLike() async {
        let store = SavedStrainsStore.preview()
        XCTAssertFalse(store.isSaved("granddaddy-purple"))
        await store.toggle(.sampleGDP)
        XCTAssertTrue(store.isSaved("granddaddy-purple"))
        await store.toggle(.sampleGDP)
        XCTAssertFalse(store.isSaved("granddaddy-purple"))
    }

    @MainActor
    func testSavedStrainDocumentMatchesWebShape() {
        let doc = SavedStrainsStore.document(for: .sampleGDP)
        XCTAssertEqual(doc["name"] as? String, "Granddaddy Purple")
        XCTAssertEqual(doc["type"] as? String, "indica")
        XCTAssertEqual(doc["thcRange"] as? String, "17–23%")
        XCTAssertNil(doc["imageUrl"] as? String)
        XCTAssertNotNil(doc["savedAt"] as? Int)
        XCTAssertNil(doc["notes"], "Notes must be omitted so a re-save cannot wipe them")
    }

    @MainActor
    func testAilmentNormalizeAndEquality() {
        XCTAssertEqual(
            SavedAilmentsStore.normalize(["Anxiety", " anxiety ", "OCD", ""]),
            ["Anxiety", "OCD"]
        )
        XCTAssertTrue(SavedAilmentsStore.equal(["ADHD", "Anxiety"], ["anxiety", "adhd"]))
        XCTAssertFalse(SavedAilmentsStore.equal(["Anxiety"], ["ADHD"]))
    }

    @MainActor
    func testPreviewNotesSaveOnTriedStrain() async {
        let store = SavedStrainsStore.preview()
        await store.addNote(to: .sampleGDP, text: "Helped me sleep")
        XCTAssertTrue(store.isSaved("granddaddy-purple"))
        XCTAssertEqual(store.notes(for: "granddaddy-purple").map(\.text), ["Helped me sleep"])
    }

    func testDirectoryIncludesLeaflyDump() {
        XCTAssertGreaterThanOrEqual(StrainCatalog.all.count, 150)
        XCTAssertTrue(StrainCatalog.all.contains { $0.slug == "blue-dream" })
    }

    @MainActor
    func testCatalogHasSixPerTypeAndAilment() {
        for type: StrainType in [.sativa, .hybrid, .indica] {
            XCTAssertGreaterThanOrEqual(
                StrainCatalog.merge([], preferringType: type).count,
                6,
                "Need 6 \(type.rawValue) strains"
            )
        }
        for ailment in Conditions.catalog {
            XCTAssertGreaterThanOrEqual(
                StrainCatalog.matching(ailment: ailment, live: []).count,
                6,
                ailment
            )
        }
    }

    @MainActor
    func testOCDChipMatchesAnxietyStrains() {
        let hits = StrainCatalog.matching(ailment: "OCD", live: [])
        XCTAssertGreaterThanOrEqual(hits.count, 6)
        XCTAssertTrue(hits.contains { $0.slug == "gelato" })
        XCTAssertTrue(hits.allSatisfy { profile in
            profile.medicalUses?.contains {
                $0.caseInsensitiveCompare("Anxiety") == .orderedSame
                    || $0.caseInsensitiveCompare("OCD") == .orderedSame
            } == true
        })
    }

    @MainActor
    func testMatchingKeepsCatalogUsesWhenLiveHasNone() {
        let live = StrainProfile(name: "Granddaddy Purple", inKnowledgeBase: true, type: .indica)
        XCTAssertNil(live.medicalUses)
        let hits = StrainCatalog.matching(ailment: "Insomnia", live: [live])
        XCTAssertTrue(hits.contains { $0.slug == "granddaddy-purple" })
    }

    @MainActor
    func testHomePreviewShowsSixThenHasMore() async {
        let model = HomeModel(api: PreviewStrainAPI())
        await model.load()
        XCTAssertEqual(model.preview(.sativa).count, 6)
        XCTAssertGreaterThan(model.strains(for: .sativa).count, 6)
        XCTAssertEqual(model.preview(.popular).count, 6)
        XCTAssertEqual(model.preview(.directory).count, 6)
        XCTAssertGreaterThan(model.strains(for: .directory).count, 20)
        XCTAssertEqual(model.preview(.ailment("Insomnia")).count, 6)
    }

    @MainActor
    func testRecentlyViewedMovesLatestToFront() {
        let defaults = UserDefaults(suiteName: "test.recents.\(UUID().uuidString)")!
        let store = RecentlyViewedStore(defaults: defaults)
        store.record(.sampleGDP)
        store.record(.sampleBlueDream)
        store.record(.sampleGDP)
        XCTAssertEqual(store.items.map(\.name), ["Granddaddy Purple", "Blue Dream"])
    }

    func testCatalogGreenCrackIsAPartialStub() {
        let greenCrack = StrainCatalog.all.first { $0.slug == "green-crack" }
        XCTAssertNotNil(greenCrack)
        XCTAssertTrue(greenCrack?.isPartial == true, "Home rails used a local stub; detail must hydrate from Leafly")
        XCTAssertNil(greenCrack?.description)
        XCTAssertNil(greenCrack?.effects)
        XCTAssertNil(greenCrack?.leaflyRating)
    }

    func testAggregateNotesAreNotQuotes() {
        let rating = CommunityNote(source: "Leafly community", text: "4.3★ from 14,919 reviews")
        let listing = CommunityNote(source: "Weedmaps listing", text: "A sativa loved for energy.")
        let review = CommunityNote(source: "Leafly review · sam", text: "Helped my afternoon fatigue without the jitters I get from coffee.")
        let reddit = CommunityNote(source: "Reddit · r/trees", text: "Green Crack is my get-off-the-couch strain.")
        XCTAssertTrue(rating.isAggregate)
        XCTAssertTrue(listing.isAggregate)
        XCTAssertFalse(review.isAggregate)
        XCTAssertFalse(reddit.isAggregate)
        XCTAssertTrue(reddit.isReddit)
    }

    func testResolvedLeaflyRatingPrefersStructuredFields() {
        var profile = StrainProfile.sampleBlueDream
        XCTAssertEqual(profile.resolvedLeaflyRating?.stars, 4.3)
        XCTAssertEqual(profile.resolvedLeaflyRating?.count, 14919)

        profile.leaflyRating = nil
        profile.leaflyReviewCount = nil
        profile.communityNotes = [
            CommunityNote(source: "Leafly community", text: "4.3★ from 14,919 reviews"),
        ]
        XCTAssertEqual(profile.resolvedLeaflyRating?.stars, 4.3)
        XCTAssertEqual(profile.resolvedLeaflyRating?.count, 14919)
        XCTAssertTrue(profile.quoteNotes.isEmpty)
    }

    func testDecodeRecommendationResult() throws {
        let json = """
        {
          "headline": "A calm night pick.",
          "summary": "Go with GDP.",
          "recommendations": [
            {
              "strainName": "Granddaddy Purple",
              "reason": "Sleep reports.",
              "bestFor": "Evening",
              "caution": "Start low."
            }
          ],
          "strains": [
            {
              "name": "Granddaddy Purple",
              "inKnowledgeBase": true,
              "type": "indica",
              "thcRange": "17–23%",
              "imageUrl": "https://images.leafly.com/flower-images/granddaddy-purple.png",
              "leaflyRating": 4.5,
              "leaflyReviewCount": 3201,
              "communityNotes": [
                {
                  "source": "Leafly review · sam",
                  "text": "Two hits and my back finally quieted down enough to sleep through the night."
                }
              ]
            }
          ],
          "resultId": "abc"
        }
        """.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(RecommendationResult.self, from: json)
        XCTAssertEqual(decoded.recommendations.first?.strainName, "Granddaddy Purple")
        XCTAssertEqual(decoded.profile(named: "granddaddy purple")?.type, .indica)
        XCTAssertEqual(
            decoded.profile(named: "granddaddy purple")?.imageUrl,
            "https://images.leafly.com/flower-images/granddaddy-purple.png"
        )
        XCTAssertEqual(decoded.profile(named: "granddaddy purple")?.leaflyRating, 4.5)
        XCTAssertEqual(decoded.profile(named: "granddaddy purple")?.leaflyReviewCount, 3201)
        XCTAssertEqual(decoded.profile(named: "granddaddy purple")?.quoteNotes.count, 1)
    }

    @MainActor
    func testCompareNeedsTwoStrains() {
        let model = FindModel(api: PreviewStrainAPI())
        XCTAssertFalse(model.canCompare)
        model.addToCompare("Blue Dream")
        XCTAssertFalse(model.canCompare)
        model.addToCompare("Granddaddy Purple")
        XCTAssertTrue(model.canCompare)
        model.addToCompare("Blue Dream")
        XCTAssertEqual(model.compareNames.count, 2)
    }
}
