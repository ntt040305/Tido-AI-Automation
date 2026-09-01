/**
 * Asset Contract Model — Factory Input & Generated Assets
 */

import { AssetCategory, AssetStatus, AssetType } from "../common/enums";
import { IdentityProfile } from "../common/identity-profile";

export type { AssetCategory, AssetStatus, AssetType };

export interface Asset {
  asset_id: string;
  project_id: string;
  scene_id?: string;
  category: AssetCategory;
  type: AssetType;
  url: string;
  storage_key: string;
  file_size_bytes?: number;
  mime_type?: string;
  status: AssetStatus;
  identity_profile?: IdentityProfile;
  metadata?: Record<string, any>;
  created_at: string;
}
