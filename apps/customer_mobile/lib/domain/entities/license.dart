class License {
  final int id;
  final String status;
  final DateTime? issuedAt;
  final DateTime? expiresAt;
  final LicensedProduct product;
  final String licenseKeyMasked;
  final int activationLimit;
  final int activationsCount;
  final int activeActivationsCount;
  final int availableActivationSlots;
  final List<Activation> activations;

  const License({
    required this.id,
    required this.status,
    this.issuedAt,
    this.expiresAt,
    required this.product,
    required this.licenseKeyMasked,
    required this.activationLimit,
    required this.activationsCount,
    required this.activeActivationsCount,
    required this.availableActivationSlots,
    required this.activations,
  });

  bool get isActive => status == 'active';
  bool get isRevoked => status == 'revoked';
  bool get isExpired => status == 'expired';
  bool get hasExpiry => expiresAt != null;

  factory License.fromJson(Map<String, dynamic> json) {
    return License(
      id: json['id'] as int,
      status: json['status'] as String? ?? 'unknown',
      issuedAt: json['issued_at'] != null ? DateTime.tryParse(json['issued_at']) : null,
      expiresAt: json['expires_at'] != null ? DateTime.tryParse(json['expires_at']) : null,
      product: LicensedProduct.fromJson(json['product'] as Map<String, dynamic>),
      licenseKeyMasked: json['license_key_masked'] as String? ?? '',
      activationLimit: json['activation_limit'] as int? ?? 0,
      activationsCount: json['activations_count'] as int? ?? 0,
      activeActivationsCount: json['active_activations_count'] as int? ?? 0,
      availableActivationSlots: json['available_activation_slots'] as int? ?? 0,
      activations: (json['activations'] as List<dynamic>?)
              ?.map((a) => Activation.fromJson(a as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}

class LicensedProduct {
  final int id;
  final String name;
  final String slug;
  final String type;

  const LicensedProduct({
    required this.id,
    required this.name,
    required this.slug,
    required this.type,
  });

  factory LicensedProduct.fromJson(Map<String, dynamic> json) {
    return LicensedProduct(
      id: json['id'] as int,
      name: json['name'] as String? ?? '',
      slug: json['slug'] as String? ?? '',
      type: json['type'] as String? ?? 'plugin',
    );
  }
}

class Activation {
  final int id;
  final String status;
  final bool active;
  final String deviceFingerprint;
  final String? platform;
  final String? pluginVersion;
  final DateTime? activatedAt;
  final DateTime? lastCheckInAt;

  const Activation({
    required this.id,
    required this.status,
    required this.active,
    required this.deviceFingerprint,
    this.platform,
    this.pluginVersion,
    this.activatedAt,
    this.lastCheckInAt,
  });

  factory Activation.fromJson(Map<String, dynamic> json) {
    return Activation(
      id: json['id'] as int,
      status: json['status'] as String? ?? 'unknown',
      active: json['active'] as bool? ?? false,
      deviceFingerprint: json['device_fingerprint'] as String? ?? '',
      platform: json['platform'] as String?,
      pluginVersion: json['plugin_version'] as String?,
      activatedAt: json['activated_at'] != null ? DateTime.tryParse(json['activated_at']) : null,
      lastCheckInAt: json['last_check_in_at'] != null ? DateTime.tryParse(json['last_check_in_at']) : null,
    );
  }
}
