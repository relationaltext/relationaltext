import {
  Document
} from "./chunk-W3MVQAE5.js";

// ../../lexicons/pub/layers/defs.json
var defs_default = {
  lexicon: 1,
  id: "pub.layers.defs",
  description: "Shared definitions for the Layers lexicons. Provides abstract anchoring primitives, W3C Web Annotation-compatible selectors (for at.margin/Semble interoperability), alignment links, and universal metadata types.",
  defs: {
    uuid: {
      type: "object",
      description: "A universally unique identifier for cross-referencing annotation objects.",
      required: ["value"],
      properties: {
        value: {
          type: "string",
          description: "The UUID string value.",
          minLength: 1,
          maxLength: 64
        }
      }
    },
    span: {
      type: "object",
      description: "A contiguous span of text defined by UTF-8 byte offsets.",
      required: ["byteStart", "byteEnd"],
      properties: {
        byteStart: {
          type: "integer",
          description: "Inclusive start UTF-8 byte offset (0-indexed).",
          minimum: 0
        },
        byteEnd: {
          type: "integer",
          description: "Exclusive end UTF-8 byte offset.",
          minimum: 0
        },
        charStart: {
          type: "integer",
          description: "Inclusive start character offset. Optional; for compatibility with character-offset datasets.",
          minimum: 0
        },
        charEnd: {
          type: "integer",
          description: "Exclusive end character offset. Optional; for compatibility with character-offset datasets.",
          minimum: 0
        }
      }
    },
    tokenRef: {
      type: "object",
      description: "A reference to a specific token within a tokenization, by index.",
      required: ["tokenizationId", "tokenIndex"],
      properties: {
        tokenizationId: {
          type: "ref",
          ref: "#uuid",
          description: "UUID of the tokenization containing the referenced token."
        },
        tokenIndex: {
          type: "integer",
          description: "0-based index of the token within its tokenization.",
          minimum: 0
        }
      }
    },
    tokenRefSequence: {
      type: "object",
      description: "A sequence of token references, possibly non-contiguous, within a single tokenization.",
      required: ["tokenizationId", "tokenIndexes"],
      properties: {
        tokenizationId: {
          type: "ref",
          ref: "#uuid",
          description: "UUID of the tokenization containing the referenced tokens."
        },
        tokenIndexes: {
          type: "array",
          description: "0-based indices of the tokens.",
          items: {
            type: "integer",
            minimum: 0
          }
        },
        anchorTokenIndex: {
          type: "integer",
          description: "Optional head/anchor token index within the sequence.",
          minimum: 0
        }
      }
    },
    temporalSpan: {
      type: "object",
      description: "A temporal span within a media source, defined by start and end times in milliseconds.",
      required: ["start", "ending"],
      properties: {
        start: {
          type: "integer",
          description: "Start time in milliseconds.",
          minimum: 0
        },
        ending: {
          type: "integer",
          description: "End time in milliseconds.",
          minimum: 0
        }
      }
    },
    boundingBox: {
      type: "object",
      description: "A spatial bounding box for image or video frame annotation.",
      required: ["x", "y", "width", "height"],
      properties: {
        x: { type: "integer", description: "X coordinate of top-left corner in pixels." },
        y: { type: "integer", description: "Y coordinate of top-left corner in pixels." },
        width: { type: "integer", description: "Width in pixels.", minimum: 1 },
        height: { type: "integer", description: "Height in pixels.", minimum: 1 }
      }
    },
    spatioTemporalAnchor: {
      type: "object",
      description: "Combined spatial and temporal anchor for video annotation with keyframe-based tracking.",
      required: ["temporalSpan"],
      properties: {
        temporalSpan: {
          type: "ref",
          ref: "#temporalSpan"
        },
        keyframes: {
          type: "array",
          description: "Keyframes defining spatial positions at specific times.",
          items: {
            type: "ref",
            ref: "#keyframe"
          }
        },
        interpolationUri: {
          type: "string",
          format: "at-uri",
          description: "AT-URI of the interpolation mode definition node. Community-expandable via knowledge graph."
        },
        interpolation: {
          type: "string",
          description: "Interpolation mode slug (fallback when interpolationUri unavailable).",
          knownValues: ["linear", "step", "cubic"]
        }
      }
    },
    keyframe: {
      type: "object",
      description: "A spatial annotation at a specific time point.",
      required: ["timeMs", "bbox"],
      properties: {
        timeMs: {
          type: "integer",
          description: "Time in milliseconds.",
          minimum: 0
        },
        bbox: {
          type: "ref",
          ref: "#boundingBox"
        },
        features: {
          type: "ref",
          ref: "#featureMap",
          description: "Per-keyframe features (e.g., visibility, occlusion percentage, confidence, pose data)."
        }
      }
    },
    temporalEntity: {
      type: "object",
      description: "A normalized temporal value representing a point, interval, duration, or uncertain range in calendar/clock time. Subsumes OWL-Time TemporalEntity (Instant, Interval, Duration) and TimeML TIMEX3 value. Consumers dispatch on which fields are populated: instant only (point), intervalStart+intervalEnd (bounded interval), duration only (pure duration), earliest+latest (uncertain bounds), recurrence (repeating pattern).",
      properties: {
        instant: {
          type: "string",
          description: "Point in time as ISO 8601 datetime (e.g., '2024-03-15', '2024-03-15T14:30:00Z'). Maps to OWL-Time Instant.",
          maxLength: 64
        },
        intervalStart: {
          type: "string",
          description: "Interval start as ISO 8601 datetime. Maps to OWL-Time hasBeginning.",
          maxLength: 64
        },
        intervalEnd: {
          type: "string",
          description: "Interval end as ISO 8601 datetime. Maps to OWL-Time hasEnd.",
          maxLength: 64
        },
        duration: {
          type: "string",
          description: "Duration as ISO 8601 duration (e.g., 'P3Y', 'PT2H30M', 'P1DT12H'). Maps to OWL-Time hasTemporalDuration.",
          maxLength: 64
        },
        earliest: {
          type: "string",
          description: "Lower bound for uncertain or vague times, as ISO 8601 datetime.",
          maxLength: 64
        },
        latest: {
          type: "string",
          description: "Upper bound for uncertain or vague times, as ISO 8601 datetime.",
          maxLength: 64
        },
        granularityUri: {
          type: "string",
          format: "at-uri",
          description: "AT-URI of the granularity definition node. Community-expandable via knowledge graph."
        },
        granularity: {
          type: "string",
          description: "Temporal granularity slug (fallback when granularityUri unavailable). Maps to OWL-Time unitType.",
          knownValues: ["millennium", "century", "decade", "year", "quarter", "month", "week", "day", "hour", "minute", "second", "millisecond", "custom"],
          maxLength: 64
        },
        calendarUri: {
          type: "string",
          format: "at-uri",
          description: "AT-URI of the calendar system definition node. Community-expandable via knowledge graph."
        },
        calendar: {
          type: "string",
          description: "Calendar system slug (fallback when calendarUri unavailable). Maps to OWL-Time TRS (Temporal Reference System).",
          knownValues: ["gregorian", "julian", "hijri", "hebrew", "iso-week", "unix", "japanese-imperial", "buddhist", "coptic", "custom"],
          maxLength: 64
        },
        recurrence: {
          type: "string",
          description: "ISO 8601 repeating interval (e.g., 'R/P1W' for weekly, 'R5/P1D' for 5 daily repetitions).",
          maxLength: 128
        },
        features: {
          type: "ref",
          ref: "#featureMap"
        }
      }
    },
    temporalModifier: {
      type: "object",
      description: "Qualitative modification of a temporal value. Subsumes TimeML TIMEX3 mod attribute and OWL-Time DateTimeDescription qualifiers.",
      properties: {
        modUri: {
          type: "string",
          format: "at-uri",
          description: "AT-URI of the temporal modifier definition node. Community-expandable via knowledge graph."
        },
        mod: {
          type: "string",
          description: "Temporal modifier slug (fallback when modUri unavailable). Maps to TimeML TIMEX3 mod.",
          knownValues: ["approximate", "early", "mid", "late", "start", "end", "before", "after", "on-or-before", "on-or-after", "less-than", "more-than", "custom"],
          maxLength: 64
        },
        features: {
          type: "ref",
          ref: "#featureMap"
        }
      }
    },
    temporalExpression: {
      type: "object",
      description: "A complete temporal annotation packaging the expression type, normalized value, modifier, anchoring, and document function. Subsumes TimeML TIMEX3 and OWL-Time GeneralDateTimeDescription. Attach to annotation objects via the temporal field.",
      properties: {
        typeUri: {
          type: "string",
          format: "at-uri",
          description: "AT-URI of the temporal expression type definition node. Community-expandable via knowledge graph."
        },
        type: {
          type: "string",
          description: "Temporal expression type slug (fallback when typeUri unavailable). Maps to TimeML TIMEX3 type.",
          knownValues: ["date", "time", "duration", "set", "interval", "relative", "custom"],
          maxLength: 64
        },
        value: {
          type: "ref",
          ref: "#temporalEntity",
          description: "The normalized temporal value."
        },
        modifier: {
          type: "ref",
          ref: "#temporalModifier",
          description: "Qualitative modifier (approximate, early, late, etc.)."
        },
        anchorRef: {
          type: "ref",
          ref: "#objectRef",
          description: "What this temporal expression is relative to (e.g., document creation time, another temporal expression, a situation). Maps to TimeML anchorTimeID."
        },
        functionUri: {
          type: "string",
          format: "at-uri",
          description: "AT-URI of the document function definition node. Community-expandable via knowledge graph."
        },
        function: {
          type: "string",
          description: "Document function slug (fallback when functionUri unavailable). Maps to TimeML functionInDocument.",
          knownValues: ["creation-time", "publication-time", "expiration-time", "modification-time", "release-time", "reception-time", "none", "custom"],
          maxLength: 64
        },
        features: {
          type: "ref",
          ref: "#featureMap"
        }
      }
    },
    spatialEntity: {
      type: "object",
      description: "A normalized spatial value representing a point, region, line, or complex geometry. Parallel to temporalEntity. Subsumes GeoJSON geometry types, WKT primitives, and ISO 19107 spatial schema. Consumers dispatch on which fields are populated: bbox only (pixel bounding box), geometry+type (parsed geometry string), geometry+geometryFormat (format-specific parsing).",
      properties: {
        bbox: {
          type: "ref",
          ref: "#boundingBox",
          description: "Structured pixel bounding box (axis-aligned rectangle). The most common case for image/video annotation."
        },
        geometry: {
          type: "string",
          description: `Geometry as a string in the format specified by geometryFormat. WKT examples: 'POINT(37.7749 -122.4194)', 'POLYGON((0 0, 100 0, 100 100, 0 100, 0 0))'. GeoJSON example: '{"type":"Point","coordinates":[-122.4194,37.7749]}'. SVG path example: 'M 10 10 L 100 10 L 100 100 Z'. Default format is WKT.`,
          maxLength: 65536
        },
        typeUri: {
          type: "string",
          format: "at-uri",
          description: "AT-URI of the geometry type definition node. Community-expandable via knowledge graph."
        },
        type: {
          type: "string",
          description: "Geometry type slug (fallback when typeUri unavailable). For dispatch without parsing the geometry string.",
          knownValues: ["point", "box", "polygon", "multi-polygon", "line-string", "multi-line-string", "circle", "ellipse", "multi-point", "geometry-collection", "custom"],
          maxLength: 64
        },
        geometryFormatUri: {
          type: "string",
          format: "at-uri",
          description: "AT-URI of the geometry format definition node. Community-expandable via knowledge graph."
        },
        geometryFormat: {
          type: "string",
          description: "Format of the geometry string (fallback when geometryFormatUri unavailable). Default is WKT.",
          knownValues: ["wkt", "geojson", "svg-path", "coco-polygon", "coco-rle", "custom"],
          maxLength: 64
        },
        crsUri: {
          type: "string",
          format: "at-uri",
          description: "AT-URI of the coordinate reference system definition node. Community-expandable via knowledge graph."
        },
        crs: {
          type: "string",
          description: "Coordinate reference system slug (fallback when crsUri unavailable). Determines how coordinates in geometry/bbox are interpreted.",
          knownValues: ["pixel", "percentage", "wgs84", "web-mercator", "custom"],
          maxLength: 64
        },
        dimensions: {
          type: "integer",
          description: "Number of coordinate dimensions (2 for planar, 3 for volumetric/elevation).",
          minimum: 2,
          maximum: 4
        },
        uncertainty: {
          type: "string",
          description: "Spatial precision or uncertainty radius as a string with units (e.g., '50m', '10px', '0.001deg'). Units depend on the CRS.",
          maxLength: 64
        },
        features: {
          type: "ref",
          ref: "#featureMap"
        }
      }
    },
    spatialModifier: {
      type: "object",
      description: "Qualitative modification of a spatial value. Parallel to temporalModifier. Indicates precision, derivation method, or processing applied to a spatial entity.",
      properties: {
        modUri: {
          type: "string",
          format: "at-uri",
          description: "AT-URI of the spatial modifier definition node. Community-expandable via knowledge graph."
        },
        mod: {
          type: "string",
          description: "Spatial modifier slug (fallback when modUri unavailable).",
          knownValues: ["approximate", "projected", "interpolated", "estimated", "buffered", "simplified", "generalized", "custom"],
          maxLength: 64
        },
        features: {
          type: "ref",
          ref: "#featureMap"
        }
      }
    },
    spatialExpression: {
      type: "object",
      description: "A complete spatial annotation packaging the expression type, normalized value, modifier, anchoring, and document function. Parallel to temporalExpression. Subsumes ISO-Space place annotations (ISO 24617-7), SpatialML PLACE elements, and general spatial semantic annotation. Attach to annotation objects via the spatial field.",
      properties: {
        typeUri: {
          type: "string",
          format: "at-uri",
          description: "AT-URI of the spatial expression type definition node. Community-expandable via knowledge graph."
        },
        type: {
          type: "string",
          description: "Spatial expression type slug (fallback when typeUri unavailable). Maps to ISO-Space spatial entity types.",
          knownValues: ["location", "region", "path", "direction", "distance", "relative", "custom"],
          maxLength: 64
        },
        value: {
          type: "ref",
          ref: "#spatialEntity",
          description: "The normalized spatial value."
        },
        modifier: {
          type: "ref",
          ref: "#spatialModifier",
          description: "Qualitative modifier (approximate, projected, interpolated, etc.)."
        },
        anchorRef: {
          type: "ref",
          ref: "#objectRef",
          description: "What this spatial expression is relative to (e.g., a landmark annotation, a reference location, a trajector). For relative spatial expressions like 'behind the building'."
        },
        functionUri: {
          type: "string",
          format: "at-uri",
          description: "AT-URI of the document function definition node. Community-expandable via knowledge graph."
        },
        function: {
          type: "string",
          description: "Document function slug (fallback when functionUri unavailable). What role this place plays in the document.",
          knownValues: ["document-location", "publication-location", "situation-location", "origin", "destination", "waypoint", "none", "custom"],
          maxLength: 64
        },
        features: {
          type: "ref",
          ref: "#featureMap"
        }
      }
    },
    pageAnchor: {
      type: "object",
      description: "Anchor to a specific page and region in a paged document (PDF, etc.). Compatible with chive.pub's page-level annotation model.",
      required: ["page"],
      properties: {
        page: {
          type: "integer",
          description: "0-indexed page number.",
          minimum: 0
        },
        boundingBox: {
          type: "ref",
          ref: "#boundingBox"
        },
        textSpan: {
          type: "ref",
          ref: "#span",
          description: "Character offsets within the page text."
        }
      }
    },
    textQuoteSelector: {
      type: "object",
      description: "W3C TextQuoteSelector: selects text by quoting it with surrounding context. Compatible with at.margin.annotation and the W3C Web Annotation Data Model.",
      required: ["exact"],
      properties: {
        exact: {
          type: "string",
          description: "The exact text to match.",
          maxLength: 5e3
        },
        prefix: {
          type: "string",
          description: "Text immediately before the selection.",
          maxLength: 500
        },
        suffix: {
          type: "string",
          description: "Text immediately after the selection.",
          maxLength: 500
        }
      }
    },
    textPositionSelector: {
      type: "object",
      description: "W3C TextPositionSelector adapted for ATProto: selects by UTF-8 byte offsets. Semantically equivalent to pub.layers.defs#span but named for W3C compatibility with at.margin.",
      required: ["byteStart", "byteEnd"],
      properties: {
        byteStart: {
          type: "integer",
          description: "Starting UTF-8 byte position (0-indexed, inclusive).",
          minimum: 0
        },
        byteEnd: {
          type: "integer",
          description: "Ending UTF-8 byte position (exclusive).",
          minimum: 0
        },
        charStart: {
          type: "integer",
          description: "Starting character position (0-indexed, inclusive). Optional; for compatibility with character-offset datasets.",
          minimum: 0
        },
        charEnd: {
          type: "integer",
          description: "Ending character position (exclusive). Optional; for compatibility with character-offset datasets.",
          minimum: 0
        }
      }
    },
    fragmentSelector: {
      type: "object",
      description: "W3C FragmentSelector: selects by URI fragment identifier.",
      required: ["value"],
      properties: {
        value: {
          type: "string",
          description: "Fragment identifier value.",
          maxLength: 1e3
        },
        conformsTo: {
          type: "string",
          format: "uri",
          description: "Specification the fragment conforms to."
        }
      }
    },
    externalTarget: {
      type: "object",
      description: "Target for annotating external resources (web pages, documents, etc.). Compatible with at.margin's target model and the W3C Web Annotation Data Model.",
      required: ["source"],
      properties: {
        source: {
          type: "string",
          format: "uri",
          description: "The URI of the external resource being annotated."
        },
        sourceHash: {
          type: "string",
          description: "SHA256 hash of normalized URI for indexing.",
          maxLength: 128
        },
        title: {
          type: "string",
          description: "Title of the resource at annotation time.",
          maxLength: 500
        },
        selector: {
          type: "union",
          description: "W3C selector for identifying the specific segment within the resource.",
          refs: [
            "#textQuoteSelector",
            "#textPositionSelector",
            "#fragmentSelector"
          ]
        }
      }
    },
    anchor: {
      type: "object",
      description: "Abstract anchor: how an annotation attaches to its source data. This is a polymorphic type; at least one anchoring field should be present. Consumers dispatch on which field(s) are populated.",
      properties: {
        textSpan: {
          type: "ref",
          ref: "#span",
          description: "Character-offset span in the expression text."
        },
        tokenRef: {
          type: "ref",
          ref: "#tokenRef",
          description: "Single token reference."
        },
        tokenRefSequence: {
          type: "ref",
          ref: "#tokenRefSequence",
          description: "Sequence of token references (possibly non-contiguous)."
        },
        temporalSpan: {
          type: "ref",
          ref: "#temporalSpan",
          description: "Temporal span in audio/video."
        },
        spatioTemporalAnchor: {
          type: "ref",
          ref: "#spatioTemporalAnchor",
          description: "Spatio-temporal region in video."
        },
        pageAnchor: {
          type: "ref",
          ref: "#pageAnchor",
          description: "Page and region in a paged document."
        },
        externalTarget: {
          type: "ref",
          ref: "#externalTarget",
          description: "External resource target (web page, document, etc.)."
        }
      }
    },
    alignmentLink: {
      type: "object",
      description: "A single link in an alignment between two parallel sequences. Maps element(s) in a source sequence to element(s) in a target sequence. Supports many-to-many correspondence for interlinear glossing, parallel text alignment, cross-tokenization mapping, etc.",
      properties: {
        sourceIndices: {
          type: "array",
          description: "Indices into the source sequence.",
          items: { type: "integer", minimum: 0 }
        },
        targetIndices: {
          type: "array",
          description: "Indices into the target sequence.",
          items: { type: "integer", minimum: 0 }
        },
        confidence: {
          type: "integer",
          description: "Alignment confidence 0-1000.",
          minimum: 0,
          maximum: 1e3
        },
        label: {
          type: "string",
          description: "Optional label for the alignment link (e.g., alignment type).",
          maxLength: 256
        },
        knowledgeRefs: {
          type: "array",
          description: "Knowledge graph references for this link (e.g., bilingual dictionary entry, translation memory source).",
          maxLength: 8,
          items: {
            type: "ref",
            ref: "#knowledgeRef"
          }
        },
        features: {
          type: "ref",
          ref: "#featureMap"
        }
      }
    },
    agentRef: {
      type: "object",
      description: "A composable reference to any agent (human annotator, ML model, crowd worker, expert panel, etc.) that produced data. Separates the identity of the producer from the interpretive framework (persona) and the software used (tool). Consumers dispatch on which field(s) are populated: did for ATProto-native agents, id for anonymized or platform-specific identifiers, knowledgeRef for externally grounded agents (ORCID, HuggingFace model card, Wikidata).",
      properties: {
        did: {
          type: "string",
          format: "did",
          description: "ATProto DID of the agent, if the agent has one."
        },
        id: {
          type: "string",
          description: "Arbitrary string identifier (anonymized crowdworker ID, platform username, model version string, etc.).",
          maxLength: 512
        },
        name: {
          type: "string",
          description: "Human-readable display name for the agent.",
          maxLength: 512
        },
        knowledgeRef: {
          type: "ref",
          ref: "#knowledgeRef",
          description: "External knowledge graph reference for the agent (e.g., ORCID for a human, HuggingFace model card for an ML model, Wikidata for an organization)."
        }
      }
    },
    annotationMetadata: {
      type: "object",
      description: "Metadata about who or what produced an annotation, when, and with what confidence. The three key provenance fields are: agent (who did it), personaRef (under what framework), and tool (with what software).",
      required: ["tool"],
      properties: {
        agent: {
          type: "ref",
          ref: "#agentRef",
          description: "The agent (human or model) that produced this annotation. Distinct from personaRef (the interpretive framework) and tool (the software)."
        },
        tool: {
          type: "string",
          description: "Name or identifier of the software tool used to produce this annotation (e.g., 'spaCy 3.7', 'brat 1.3', 'ELAN 6.4'). Distinct from agent (who ran the tool).",
          maxLength: 512
        },
        timestamp: {
          type: "string",
          format: "datetime",
          description: "When the annotation was produced."
        },
        confidence: {
          type: "integer",
          description: "Confidence score scaled 0-1000 (to avoid floats). 1000 = maximum confidence.",
          minimum: 0,
          maximum: 1e3
        },
        personaRef: {
          type: "string",
          format: "at-uri",
          description: "Reference to the persona/annotation framework under which this annotation was produced. Distinct from agent (who did it)."
        },
        dependencies: {
          type: "array",
          description: "References to upstream records this annotation was derived from.",
          maxLength: 32,
          items: {
            type: "ref",
            ref: "#objectRef"
          }
        },
        digest: {
          type: "string",
          description: "Content hash for integrity verification.",
          maxLength: 128
        }
      }
    },
    knowledgeRef: {
      type: "object",
      description: "A reference to an external knowledge base entry. Supports ATProto-native KBs (e.g., chive.pub with AT-URI nodes), external KBs (e.g., Wikidata with QIDs), and user/persona-specific KBs (AT-URIs in user PDSes).",
      required: ["source", "identifier"],
      properties: {
        sourceUri: {
          type: "string",
          format: "at-uri",
          description: "AT-URI of the knowledge base type definition node. Community-expandable via knowledge graph."
        },
        source: {
          type: "string",
          description: "Knowledge base source slug (fallback when sourceUri unavailable).",
          knownValues: ["chive.pub", "wikidata", "wordnet", "framenet", "propbank", "verbnet", "unimorph", "glottolog", "cldr", "custom"],
          maxLength: 128
        },
        identifier: {
          type: "string",
          description: "The identifier within the knowledge base (e.g., Wikidata QID, chive.pub node URI, Glottolog languoid ID).",
          maxLength: 512
        },
        uri: {
          type: "string",
          format: "uri",
          description: "Optional full URI for the knowledge base entry."
        },
        label: {
          type: "string",
          description: "Human-readable label for the referenced entity.",
          maxLength: 1024
        }
      }
    },
    featureMap: {
      type: "object",
      description: "An open-ended set of typed key-value features that can be attached to any annotation. Provides maximum extensibility without committing to any label set or linguistic theory.",
      required: ["entries"],
      properties: {
        entries: {
          type: "array",
          description: "The feature entries.",
          items: {
            type: "ref",
            ref: "#feature"
          }
        }
      }
    },
    feature: {
      type: "object",
      description: "A single key-value feature.",
      required: ["key", "value"],
      properties: {
        key: {
          type: "string",
          description: "Feature name/key.",
          maxLength: 256
        },
        value: {
          type: "string",
          description: "Feature value as string. Consumers may parse typed values based on the key's semantics.",
          maxLength: 4096
        }
      }
    },
    constraint: {
      type: "object",
      description: "An abstract constraint expression. Used for type constraints on role slots, slot-level constraints in templates, cross-slot agreement constraints, and any other declarative restriction. The expression field holds a DSL string whose format is identified by expressionFormat/expressionFormatUri.",
      required: ["expression"],
      properties: {
        expression: {
          type: "string",
          description: `The constraint expression (e.g., 'self.pos == "VERB"', 'subject.features.number == verb.features.number').`,
          maxLength: 4096
        },
        expressionFormatUri: {
          type: "string",
          format: "at-uri",
          description: "AT-URI of the expression format definition node. Community-expandable via knowledge graph."
        },
        expressionFormat: {
          type: "string",
          description: "Expression format slug (fallback when expressionFormatUri unavailable).",
          knownValues: ["python-expr", "json-logic", "regex", "sparql-filter", "type-ref", "custom"],
          maxLength: 128
        },
        scopeUri: {
          type: "string",
          format: "at-uri",
          description: "AT-URI of the scope definition node. Community-expandable via knowledge graph."
        },
        scope: {
          type: "string",
          description: "Constraint scope slug (fallback when scopeUri unavailable).",
          knownValues: ["slot", "template", "cross-template", "global"],
          maxLength: 128
        },
        context: {
          type: "array",
          description: "Names of the slots or variables this constraint ranges over (for cross-slot and cross-template constraints).",
          maxLength: 32,
          items: {
            type: "string",
            maxLength: 256
          }
        },
        description: {
          type: "string",
          description: "Human-readable description of the constraint.",
          maxLength: 2048
        }
      }
    },
    objectRef: {
      type: "object",
      description: "A composable reference to any Layers object, whether local (same record, by UUID), remote (different record, by AT-URI + optional object UUID), or external (knowledge graph entry). This is the universal cross-referencing primitive; consumers dispatch on which field(s) are populated. Used by argumentRef, graphNode, alignment endpoints, and any other cross-object pointer.",
      properties: {
        localId: {
          type: "ref",
          ref: "#uuid",
          description: "UUID of an object within the same record."
        },
        recordRef: {
          type: "string",
          format: "at-uri",
          description: "AT-URI of a Layers record in another user's PDS or another record in the same PDS."
        },
        objectId: {
          type: "ref",
          ref: "#uuid",
          description: "UUID of a specific object within the record referenced by recordRef."
        },
        knowledgeRef: {
          type: "ref",
          ref: "#knowledgeRef",
          description: "Reference to an external knowledge graph node (Wikidata, chive.pub, FrameNet, etc.)."
        }
      }
    }
  }
};

// ../../lexicons/pub/layers/annotation/annotationLayer.json
var annotationLayer_default = {
  lexicon: 1,
  id: "pub.layers.annotation.annotationLayer",
  defs: {
    main: {
      type: "record",
      description: "A named layer of annotations over an expression. All annotation types use this single record type. The combination of kind, subkind, and formalism tells the appview how to render. Multiple layers can coexist for the same expression.",
      key: "tid",
      record: {
        type: "object",
        required: ["expression", "kind", "annotations", "createdAt"],
        properties: {
          expression: {
            type: "string",
            format: "at-uri",
            description: "The expression this annotation layer applies to."
          },
          kindUri: {
            type: "string",
            format: "at-uri",
            description: "AT-URI of the annotation kind definition node. Community-expandable via knowledge graph."
          },
          kind: {
            type: "string",
            description: "Primary annotation kind slug (fallback when kindUri unavailable). Determines the structural interpretation of annotations in this layer.",
            knownValues: [
              "token-tag",
              "span",
              "relation",
              "tree",
              "graph",
              "tier",
              "document-tag"
            ],
            maxLength: 128
          },
          subkindUri: {
            type: "string",
            format: "at-uri",
            description: "AT-URI of the annotation subkind definition node. Community-expandable via knowledge graph."
          },
          subkind: {
            type: "string",
            description: "Annotation subkind slug (fallback when subkindUri unavailable). The appview uses this for specialized rendering.",
            knownValues: [
              "pos",
              "xpos",
              "ner",
              "lemma",
              "morph",
              "supersense",
              "sense",
              "chunk",
              "speaker",
              "gloss",
              "phonetic",
              "prosody",
              "tobi",
              "language-id",
              "entity-mention",
              "situation-mention",
              "frame",
              "predicate",
              "discourse-unit",
              "speech-act",
              "temporal-expression",
              "temporal-signal",
              "spatial-expression",
              "spatial-signal",
              "spatial-relation",
              "location-mention",
              "sentiment",
              "emotion",
              "stance",
              "information-structure",
              "error",
              "correction",
              "code-switch",
              "highlight",
              "comment",
              "bookmark",
              "temporal-value",
              "temporal-vagueness",
              "dependency",
              "enhanced-dependency",
              "constituency",
              "ccg",
              "coreference",
              "bridging",
              "temporal-relation",
              "causal-relation",
              "discourse-relation",
              "custom"
            ],
            maxLength: 128
          },
          formalismUri: {
            type: "string",
            format: "at-uri",
            description: "AT-URI of the formalism definition node. Community-expandable via knowledge graph."
          },
          formalism: {
            type: "string",
            description: "Formalism slug (fallback when formalismUri unavailable). The linguistic formalism or annotation standard used.",
            knownValues: [
              "universal-dependencies",
              "penn-treebank",
              "stanford",
              "prague",
              "propbank",
              "framenet",
              "verbnet",
              "amr",
              "ucca",
              "rst",
              "erst",
              "sdrt",
              "pdtb",
              "timeml",
              "iso-space",
              "spatialml",
              "conll-u",
              "brat",
              "elan",
              "leipzig-glossing",
              "ipa",
              "tobi",
              "bpe",
              "sentencepiece",
              "unimorph",
              "wals",
              "custom"
            ],
            maxLength: 128
          },
          sourceMethodUri: {
            type: "string",
            format: "at-uri",
            description: "AT-URI of the annotation source method definition node. Community-expandable via knowledge graph."
          },
          sourceMethod: {
            type: "string",
            description: "How this annotation layer was produced (fallback when sourceMethodUri unavailable). Follows UD's per-layer annotation source tracking.",
            knownValues: [
              "manual-native",
              "manual-corrected",
              "automatic",
              "automatic-corrected",
              "converted",
              "converted-corrected",
              "crowd-sourced",
              "custom"
            ],
            maxLength: 128
          },
          labelSet: {
            type: "string",
            description: "Identifier for the label set used (e.g., 'universal-pos', 'ontonotes-ner', 'penn-treebank-pos').",
            maxLength: 256
          },
          ontologyRef: {
            type: "string",
            format: "at-uri",
            description: "Reference to a pub.layers.ontology defining the types used in this layer."
          },
          tokenizationId: {
            type: "ref",
            ref: "pub.layers.defs#uuid",
            description: "For token-aligned layers (kind=token-tag, dependency, constituency, etc.): the tokenization these annotations are aligned to."
          },
          rank: {
            type: "integer",
            description: "Rank among k-best alternatives (1 = best).",
            minimum: 1
          },
          alternativesRef: {
            type: "string",
            format: "at-uri",
            description: "Reference to the top-ranked layer in a k-best group."
          },
          parentLayerRef: {
            type: "string",
            format: "at-uri",
            description: "For dependent/subordinate layers: the parent layer this one subdivides or refines. Supports ELAN-style tier dependencies, error-correction pairs, etc."
          },
          language: {
            type: "string",
            description: "BCP-47 language tag for this annotation layer, if different from the expression's language.",
            maxLength: 64
          },
          annotations: {
            type: "array",
            description: "The annotations in this layer.",
            items: {
              type: "ref",
              ref: "pub.layers.annotation.defs#annotation"
            }
          },
          metadata: {
            type: "ref",
            ref: "pub.layers.defs#annotationMetadata"
          },
          createdAt: {
            type: "string",
            format: "datetime"
          }
        }
      }
    }
  }
};

// ../../lexicons/pub/layers/expression/expression.json
var expression_default = {
  lexicon: 1,
  id: "pub.layers.expression.expression",
  description: "An Expression is the primary document model in Layers. It represents any linguistic unit (a document, transcript, recording, paragraph, sentence, word, morpheme) with recursive nesting via parent references. Inspired by Concrete's Communication, generalized to support recursive sub-expression structure.",
  defs: {
    main: {
      type: "record",
      description: "An expression record representing a linguistic data source or unit at any granularity, from full documents down to individual morphemes.",
      key: "tid",
      record: {
        type: "object",
        required: ["id", "kind", "createdAt"],
        properties: {
          id: {
            type: "string",
            description: "A corpus-level unique identifier (headline, URL, document ID, etc.).",
            maxLength: 1024
          },
          kindUri: {
            type: "string",
            format: "at-uri",
            description: "AT-URI of the expression kind definition node. Community-expandable via knowledge graph."
          },
          kind: {
            type: "string",
            description: "Expression kind slug (fallback when kindUri unavailable).",
            knownValues: ["document", "transcript", "dialogue", "social-media", "email", "article", "recording", "video", "multimodal", "code", "section", "paragraph", "chapter", "turn", "utterance", "heading", "list", "sentence", "clause", "phrase", "word", "morpheme", "character", "other"],
            maxLength: 128
          },
          text: {
            type: "string",
            description: "The full raw text of the expression. All byte-offset spans reference this string.",
            maxLength: 1e7
          },
          parentRef: {
            type: "string",
            format: "at-uri",
            description: "Reference to the parent Expression this one is nested within. Absent for top-level expressions (documents, recordings, etc.)."
          },
          anchor: {
            type: "ref",
            ref: "pub.layers.defs#anchor",
            description: "How this expression attaches to its parent (character span, temporal span, etc.)."
          },
          mediaRef: {
            type: "string",
            format: "at-uri",
            description: "Reference to an associated media record (audio, video, image)."
          },
          mediaBlob: {
            type: "blob",
            description: "Optional inline media blob.",
            accept: ["audio/*", "video/*", "image/*"],
            maxSize: 52428800
          },
          language: {
            type: "string",
            description: "BCP-47 language tag for the primary language.",
            maxLength: 32
          },
          languages: {
            type: "array",
            description: "Additional BCP-47 tags for multilingual or code-switching expressions.",
            maxLength: 64,
            items: {
              type: "string",
              maxLength: 32
            }
          },
          metadata: {
            type: "ref",
            ref: "pub.layers.defs#annotationMetadata"
          },
          features: {
            type: "ref",
            ref: "pub.layers.defs#featureMap",
            description: "Arbitrary document-level features and metadata."
          },
          sourceUrl: {
            type: "string",
            format: "uri",
            description: "URL of the external web resource this expression was derived from or annotates. The appview indexes this field to discover co-located annotations from other ATProto apps.",
            maxLength: 4096
          },
          sourceRef: {
            type: "string",
            format: "at-uri",
            description: "AT-URI of an external ATProto record this expression is derived from or annotates (e.g., a standard.site Leaflet post, a com.whtwnd blog entry, an app.bsky.feed.post, an at.margin.bookmark)."
          },
          eprintRef: {
            type: "string",
            format: "at-uri",
            description: "Reference to an eprint record that this expression is associated with."
          },
          knowledgeRefs: {
            type: "array",
            description: "References to knowledge base entries relevant to this expression.",
            maxLength: 128,
            items: {
              type: "ref",
              ref: "pub.layers.defs#knowledgeRef"
            }
          },
          createdAt: {
            type: "string",
            format: "datetime"
          }
        }
      }
    }
  }
};

// ../../lexicons/org/relationaltext/richtext/document.json
var document_default = {
  lexicon: 1,
  $type: "com.atproto.lexicon.schema",
  id: "org.relationaltext.richtext.document",
  revision: 1,
  description: "An extended rich text document: UTF-8 text plus a sorted array of facets. The text field is always readable as plain text by clients that don't understand facets. Facets are the annotation overlay.",
  defs: {
    main: {
      type: "object",
      description: "A rich text document with text and facets.",
      required: ["text"],
      properties: {
        text: {
          type: "string",
          maxLength: 300,
          maxGraphemes: 300,
          description: "The raw UTF-8 text content. Always valid as plain text. Blocks are separated by newline characters (\\n)."
        },
        facets: {
          type: "array",
          items: { type: "ref", ref: "#facet" },
          description: "Sorted array of facets in canonical order: byteStart asc, byteEnd desc (wider first), $type of first feature lex."
        }
      }
    },
    facet: {
      type: "object",
      description: "A byte-range annotation on the document's text, carrying one or more typed features.",
      required: ["index", "features"],
      properties: {
        index: { type: "ref", ref: "#byteSlice" },
        features: {
          type: "array",
          items: {
            type: "union",
            refs: [
              "app.bsky.richtext.facet#mention",
              "app.bsky.richtext.facet#link",
              "app.bsky.richtext.facet#tag",
              "org.relationaltext.richtext.mark",
              "org.relationaltext.richtext.block"
            ]
          },
          description: "One or more features applied to this byte range. A facet may carry multiple features (e.g., both a link and bold)."
        }
      }
    },
    byteSlice: {
      type: "object",
      description: "A half-open byte range [byteStart, byteEnd) into the document's UTF-8 text string.",
      required: ["byteStart", "byteEnd"],
      properties: {
        byteStart: {
          type: "integer",
          minimum: 0,
          description: "Inclusive start byte index (UTF-8 character boundary)."
        },
        byteEnd: {
          type: "integer",
          minimum: 0,
          description: "Exclusive end byte index (UTF-8 character boundary). byteEnd > byteStart."
        }
      }
    }
  }
};

// src/layers.ts
async function parseLexiconSchema(lexiconJson) {
  const wasm = await import("./wasm.js");
  const result = JSON.parse(
    wasm.parse_lexicon_schema(JSON.stringify(lexiconJson))
  );
  return result;
}
async function convertViaPanproto(sourceLexicon, targetLexicon, doc) {
  const wasm = await import("./wasm.js");
  const docJson = doc instanceof Document ? doc._raw() : JSON.stringify(doc);
  const result = wasm.convert_via_panproto(
    JSON.stringify(sourceLexicon),
    JSON.stringify(targetLexicon),
    docJson
  );
  return JSON.parse(result);
}
async function crossConvert(sourceLexicon, targetLexicon, doc) {
  return convertViaPanproto(sourceLexicon, targetLexicon, doc);
}
async function toLayersViaPanproto(doc) {
  try {
    const result = await convertViaPanproto(
      document_default,
      annotationLayer_default,
      doc
    );
    return result;
  } catch {
    return toLayers(doc);
  }
}
async function fromLayersViaPanproto(expression, annotationLayers, complement) {
  try {
    const layersExport = {
      expression,
      annotationLayers,
      complement: complement ?? {
        expandSemantics: {},
        featureClasses: {},
        facetGroups: []
      }
    };
    const result = await convertViaPanproto(
      annotationLayer_default,
      document_default,
      layersExport
    );
    return Document.fromJSON(result);
  } catch {
    return fromLayers(expression, annotationLayers, complement);
  }
}
function toLayers(doc) {
  const d = doc instanceof Document ? doc.toJSON() : doc;
  const expression = {
    text: d.text,
    kind: "document"
  };
  const annotations = [];
  const expandSemantics = {};
  const featureClasses = {};
  const facetGroups = [];
  for (const facet of d.facets ?? []) {
    const labels = [];
    for (const feature of facet.features) {
      const typeId = feature["$type"];
      const name = feature["name"];
      const label = typeId && name ? `${typeId}#${name}` : typeId ?? name ?? "unknown";
      labels.push(label);
      const value = {};
      for (const [k, v] of Object.entries(feature)) {
        if (k !== "$type") {
          value[k] = v;
        }
      }
      annotations.push({
        anchor: {
          $type: "pub.layers.defs#span",
          byteStart: facet.index.byteStart,
          byteEnd: facet.index.byteEnd
        },
        label,
        value
      });
      const key = `${facet.index.byteStart}:${facet.index.byteEnd}:${label}`;
      const expandStart = feature["expandStart"];
      const expandEnd = feature["expandEnd"];
      if (expandStart !== void 0 || expandEnd !== void 0) {
        expandSemantics[key] = {
          ...expandStart !== void 0 ? { expandStart } : {},
          ...expandEnd !== void 0 ? { expandEnd } : {}
        };
      }
    }
    if (labels.length > 1) {
      facetGroups.push({
        byteStart: facet.index.byteStart,
        byteEnd: facet.index.byteEnd,
        labels
      });
    }
  }
  return {
    expression,
    annotationLayers: [{ kind: "span", annotations }],
    complement: { expandSemantics, featureClasses, facetGroups }
  };
}
function fromLayers(expression, annotationLayers, complement) {
  const allAnnotations = annotationLayers.flatMap((l) => l.annotations);
  const facetMap = /* @__PURE__ */ new Map();
  for (const ann of allAnnotations) {
    const rangeKey = `${ann.anchor.byteStart}:${ann.anchor.byteEnd}`;
    let entry = facetMap.get(rangeKey);
    if (!entry) {
      entry = { byteStart: ann.anchor.byteStart, byteEnd: ann.anchor.byteEnd, features: [] };
      facetMap.set(rangeKey, entry);
    }
    const feature = {};
    const hashIdx = ann.label.indexOf("#");
    if (hashIdx >= 0) {
      feature["$type"] = ann.label.substring(0, hashIdx);
      feature["name"] = ann.label.substring(hashIdx + 1);
    } else {
      feature["$type"] = ann.label;
    }
    for (const [k, v] of Object.entries(ann.value)) {
      if (k !== "$type") {
        feature[k] = v;
      }
    }
    if (complement) {
      const compKey = `${ann.anchor.byteStart}:${ann.anchor.byteEnd}:${ann.label}`;
      const expand = complement.expandSemantics[compKey];
      if (expand) {
        if (expand.expandStart !== void 0) feature["expandStart"] = expand.expandStart;
        if (expand.expandEnd !== void 0) feature["expandEnd"] = expand.expandEnd;
      }
    }
    entry.features.push(feature);
  }
  const facets = [...facetMap.values()].sort((a, b) => a.byteStart - b.byteStart || b.byteEnd - a.byteEnd).map((entry) => ({
    index: { byteStart: entry.byteStart, byteEnd: entry.byteEnd },
    features: entry.features
  }));
  return Document.fromJSON({ text: expression.text, facets });
}

export {
  defs_default,
  annotationLayer_default,
  expression_default,
  document_default,
  parseLexiconSchema,
  convertViaPanproto,
  crossConvert,
  toLayersViaPanproto,
  fromLayersViaPanproto,
  toLayers,
  fromLayers
};
