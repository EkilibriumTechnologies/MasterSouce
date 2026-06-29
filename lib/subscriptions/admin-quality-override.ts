/** @deprecated Import from admin-entitlement-override instead. */
export {
  ADMIN_ENTITLEMENT_OVERRIDE_EMAIL,
  ADMIN_ENTITLEMENT_OVERRIDE_PLAN_ID,
  ADMIN_QUALITY_OVERRIDE_EMAIL,
  ADMIN_QUALITY_OVERRIDE_PLAN_ID,
  ADMIN_QUALITY_OVERRIDE_QUALITY,
  applyAdminEntitlementOverride,
  applyAdminQualityOverride,
  isAdminEntitlementOverrideEmail,
  isAdminQualityOverrideEmail,
  maskNormalizedEmailForLog,
  normalizeAdminOverrideEmail,
  type AdminQualityOverrideAudit
} from "@/lib/subscriptions/admin-entitlement-override";
