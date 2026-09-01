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
    industry: "food_beverage",
    objective: "conversion",
    target_channel: "social_media",
    target_audience: "Phụ nữ hiện đại quan tâm đến sức khỏe & lối sống cao cấp",
  },
  sales_context: {
    product_name: "Trà Việt Nam Cao Cấp",
    offer_text: "Thương hiệu Trà Thảo Mộc Wellness",
    pain_point: "Căng thẳng công việc & nhu cầu chăm sóc sức khỏe tự nhiên",
    benefit: "Chiết xuất 100% thảo mộc tự nhiên, thanh lọc cơ thể & thư thái",
    cta_text: "Mua Ngay Đón Ưu Đãi",
  },
  creative_direction: {
    visual_style: "commercial_advertising",
    emotional_tone: "premium_wellness",
    aspect_ratio: "9:16",
    composition_layout: "Hero center visual với vùng trống cho thông điệp quảng cáo",
    product_composition_mode: "single",
    product_identity_strength: "strict",
    target_product_count: 1,
  },
  brand_identity: {
    brand_name: "TIDO Premium Tea",
    primary_colors: ["#10B981", "#064E3B"],
    product_assets: [],
  },
  user_notes: "Ánh sáng tự nhiên ấm áp, phong cách nhiếp ảnh quảng cáo cao cấp.",
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
    return Boolean(
      creativeBrief.asset_type &&
        creativeBrief.marketing_context.industry &&
        creativeBrief.marketing_context.objective &&
        creativeBrief.sales_context.product_name &&
        !isRunning
    );
  },

  hasProductAssets: () => {
    const { creativeBrief } = get();
    return creativeBrief.brand_identity.product_assets.length > 0;
  },
}));
