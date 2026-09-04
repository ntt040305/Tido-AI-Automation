import { create } from "zustand";
import {
  CreativeSession,
  CreativeBrief,
  AIStrategy,
  GenerationJobState,
  GeneratedAsset,
  PictureEngineError,
  UIState,
} from "../types/picture-engine.types";
import {
  mockCreativeSession,
  mockCreativeBrief,
  mockAIStrategy,
  mockGeneratedAsset,
} from "../mock/picture-engine.mock";

export interface PictureEngineStoreState {
  // State
  uiState: UIState;
  creativeSession: CreativeSession;
  creativeBrief: CreativeBrief;
  aiStrategy: AIStrategy | null;
  generationJob: GenerationJobState;
  currentAsset: GeneratedAsset | null;
  history: GeneratedAsset[];
  error: PictureEngineError | null;

  // Actions
  setUIState: (updates: Partial<UIState>) => void;
  toggleStrategyPanel: () => void;
  toggleHistoryDrawer: () => void;
  updateBrief: (updates: Partial<CreativeBrief>) => void;
  updateCreativeConcept: (concept: string) => void;
  updateAssetConfiguration: (config: {
    asset_type?: import("../types/picture-engine.types").AssetType;
    target_product_count?: number | "multiple";
    aspect_ratio?: import("../types/picture-engine.types").AspectRatioType;
  }) => void;
  updateMarketingContext: (
    updates: Partial<CreativeBrief["marketing_context"]>
  ) => void;
  updateSalesContext: (
    updates: Partial<CreativeBrief["sales_context"]>
  ) => void;
  updateCreativeDirection: (
    updates: Partial<CreativeBrief["creative_direction"]>
  ) => void;
  updateBrandIdentity: (
    updates: Partial<CreativeBrief["brand_identity"]>
  ) => void;
  setAIStrategy: (strategy: AIStrategy | null) => void;
  setGenerationJob: (job: Partial<GenerationJobState>) => void;
  setCurrentAsset: (asset: GeneratedAsset | null) => void;
  setError: (error: PictureEngineError | null) => void;
  resetCreativeBrief: () => void;
  resetSession: () => void;

  // Selectors
  canGenerate: () => boolean;
  hasProductAssets: () => boolean;
}

export const defaultCreativeBrief: CreativeBrief = {
  asset_type: "poster",
  marketing_context: {
    industry: "beauty_skincare",
    objective: "conversion",
    target_channel: "social_media",
    target_audience: "Modern consumers seeking premium product quality",
  },
  sales_context: {
    product_name: "Commercial Product",
    offer_text: "Special Edition",
    pain_point: "",
    benefit: "High performance & premium aesthetic presentation",
    cta_text: "Shop Now",
  },
  creative_direction: {
    visual_style: "commercial_advertising",
    emotional_tone: "premium_luxury",
    aspect_ratio: "9:16",
    composition_layout: "Hero center visual with clear space for copy layout",
    product_composition_mode: "single",
    product_identity_strength: "strict",
    target_product_count: 1,
  },
  brand_identity: {
    brand_name: "",
    primary_colors: ["#10B981", "#064E3B"],
    product_assets: [],
  },
  user_notes: "Studio lighting, clear product hero placement, commercial photography.",
};

export const usePictureEngineStore = create<PictureEngineStoreState>((set, get) => ({
  uiState: {
    activePanel: "brief",
    isStrategyOpen: true,
    isHistoryOpen: false,
  },
  creativeSession: {
    projectId: `proj_img_${Date.now()}`,
    projectName: "Chiến dịch Visual Commercial",
    campaignName: "Default Campaign",
  },
  creativeBrief: defaultCreativeBrief,
  aiStrategy: null,
  generationJob: {
    job_id: null,
    status: "idle",
    progress_percent: 0,
    current_step_label: "",
  },
  currentAsset: null,
  history: [],
  error: null,

  setUIState: (updates) =>
    set((state) => ({ uiState: { ...state.uiState, ...updates } })),

  toggleStrategyPanel: () =>
    set((state) => ({
      uiState: {
        ...state.uiState,
        isStrategyOpen: !state.uiState.isStrategyOpen,
      },
    })),

  toggleHistoryDrawer: () =>
    set((state) => ({
      uiState: {
        ...state.uiState,
        isHistoryOpen: !state.uiState.isHistoryOpen,
      },
    })),

  updateBrief: (updates) =>
    set((state) => ({ creativeBrief: { ...state.creativeBrief, ...updates } })),

  updateCreativeConcept: (concept: string) =>
    set((state) => ({
      creativeBrief: {
        ...state.creativeBrief,
        creative_concept: concept,
        user_notes: concept,
      },
    })),

  updateAssetConfiguration: (config) =>
    set((state) => {
      const newBrief = { ...state.creativeBrief };
      if (config.asset_type) {
        newBrief.asset_type = config.asset_type;
      }
      if (config.aspect_ratio || config.target_product_count !== undefined) {
        newBrief.creative_direction = {
          ...newBrief.creative_direction,
          ...(config.aspect_ratio ? { aspect_ratio: config.aspect_ratio } : {}),
          ...(config.target_product_count !== undefined
            ? {
                target_product_count:
                  typeof config.target_product_count === "number"
                    ? config.target_product_count
                    : 4,
              }
            : {}),
        };
      }
      return { creativeBrief: newBrief };
    }),

  updateMarketingContext: (updates) =>
    set((state) => ({
      creativeBrief: {
        ...state.creativeBrief,
        marketing_context: {
          ...state.creativeBrief.marketing_context,
          ...updates,
        },
      },
    })),

  updateSalesContext: (updates) =>
    set((state) => ({
      creativeBrief: {
        ...state.creativeBrief,
        sales_context: {
          ...state.creativeBrief.sales_context,
          ...updates,
        },
      },
    })),

  updateCreativeDirection: (updates) =>
    set((state) => ({
      creativeBrief: {
        ...state.creativeBrief,
        creative_direction: {
          ...state.creativeBrief.creative_direction,
          ...updates,
        },
      },
    })),

  updateBrandIdentity: (updates) =>
    set((state) => ({
      creativeBrief: {
        ...state.creativeBrief,
        brand_identity: {
          ...state.creativeBrief.brand_identity,
          ...updates,
        },
      },
    })),

  setAIStrategy: (strategy) => set({ aiStrategy: strategy }),

  setGenerationJob: (updates) =>
    set((state) => ({
      generationJob: { ...state.generationJob, ...updates },
    })),

  setCurrentAsset: (asset) =>
    set((state) => ({
      currentAsset: asset,
      history: asset ? [asset, ...state.history] : state.history,
    })),

  setError: (error) => set({ error }),

  resetCreativeBrief: () =>
    set({
      creativeBrief: mockCreativeBrief,
      aiStrategy: mockAIStrategy,
      currentAsset: null,
      error: null,
      generationJob: {
        job_id: null,
        status: "idle",
        progress_percent: 0,
        current_step_label: "",
      },
    }),

  resetSession: () =>
    set({
      creativeSession: {
        projectId: `proj_${Date.now()}`,
        projectName: "Chiến dịch Mới",
        campaignName: "Default Campaign",
      },
      creativeBrief: mockCreativeBrief,
      aiStrategy: null,
      currentAsset: null,
      history: [],
      error: null,
      generationJob: {
        job_id: null,
        status: "idle",
        progress_percent: 0,
        current_step_label: "",
      },
    }),

  canGenerate: () => {
    const { creativeBrief, generationJob } = get();
    const isRunning =
      generationJob.status === "rendering" ||
      generationJob.status === "interpreting" ||
      generationJob.status === "compiling" ||
      generationJob.status === "qc_evaluating";

    const hasConcept = Boolean(
      (creativeBrief.creative_concept && creativeBrief.creative_concept.trim()) ||
        (creativeBrief.user_notes && creativeBrief.user_notes.trim()) ||
        (creativeBrief.sales_context && creativeBrief.sales_context.product_name && creativeBrief.sales_context.product_name.trim())
    );

    return Boolean(creativeBrief.asset_type && hasConcept && !isRunning);
  },

  hasProductAssets: () => {
    const { creativeBrief } = get();
    return creativeBrief.brand_identity.product_assets.length > 0;
  },
}));
