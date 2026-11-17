CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(60) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mission_details (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  mission_code VARCHAR(60) NOT NULL,
  mission_name VARCHAR(160) NOT NULL,
  vehicle_name VARCHAR(120) NOT NULL,
  mission_phase VARCHAR(40) NOT NULL DEFAULT 'IN_FLIGHT',
  simulation_mode VARCHAR(24) NOT NULL DEFAULT 'NORMAL',
  launch_at DATETIME(3) NULL,
  return_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mission_code (mission_code),
  KEY idx_mission_phase (mission_phase)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS astronauts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  mission_id BIGINT UNSIGNED NOT NULL,
  call_sign VARCHAR(40) NOT NULL,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  title VARCHAR(100) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ON_MISSION',
  avatar_tone VARCHAR(24) NOT NULL DEFAULT 'teal',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_astronaut_call_sign (call_sign),
  UNIQUE KEY uq_astronaut_user (user_id),
  KEY idx_astronaut_mission (mission_id),
  KEY idx_astronaut_status (status),
  CONSTRAINT fk_astronaut_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_astronaut_mission FOREIGN KEY (mission_id) REFERENCES mission_details(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id SMALLINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_role (role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vital_signs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  astronaut_id BIGINT UNSIGNED NOT NULL,
  heart_rate DECIMAL(5,1) NOT NULL,
  spo2 DECIMAL(5,2) NOT NULL,
  systolic_bp SMALLINT UNSIGNED NOT NULL,
  diastolic_bp SMALLINT UNSIGNED NOT NULL,
  core_temperature_c DECIMAL(4,2) NOT NULL,
  respiratory_rate DECIMAL(5,1) NOT NULL,
  ecg_lead_ii JSON NOT NULL,
  eva_suit_pressure_psi DECIMAL(5,2) NOT NULL,
  radiation_msv_h DECIMAL(6,3) NOT NULL,
  aux_signals JSON NOT NULL,
  recorded_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_vital_astronaut_time (astronaut_id, recorded_at),
  KEY idx_vital_time (recorded_at),
  CONSTRAINT fk_vital_astronaut FOREIGN KEY (astronaut_id) REFERENCES astronauts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS anatomical_markers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  astronaut_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  body_zone VARCHAR(48) NOT NULL,
  coord_x DECIMAL(6,2) NOT NULL,
  coord_y DECIMAL(6,2) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  clinical_note TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolved_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_marker_astronaut_status (astronaut_id, resolved, created_at),
  KEY idx_marker_creator (created_by),
  CONSTRAINT fk_marker_astronaut FOREIGN KEY (astronaut_id) REFERENCES astronauts(id) ON DELETE CASCADE,
  CONSTRAINT fk_marker_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS health_alerts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  astronaut_id BIGINT UNSIGNED NOT NULL,
  vital_sign_id BIGINT UNSIGNED NULL,
  category VARCHAR(48) NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  body_zone VARCHAR(48) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolved_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_alert_astronaut_status (astronaut_id, status, created_at),
  KEY idx_alert_severity_time (severity, created_at),
  CONSTRAINT fk_alert_astronaut FOREIGN KEY (astronaut_id) REFERENCES astronauts(id) ON DELETE CASCADE,
  CONSTRAINT fk_alert_vital FOREIGN KEY (vital_sign_id) REFERENCES vital_signs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS emergency_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  astronaut_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  event_code VARCHAR(48) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'RECEIVED',
  message TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  acknowledged_at DATETIME(3) NULL,
  resolved_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_emergency_code (event_code),
  KEY idx_emergency_astronaut_status (astronaut_id, status, created_at),
  KEY idx_emergency_time (created_at),
  CONSTRAINT fk_emergency_astronaut FOREIGN KEY (astronaut_id) REFERENCES astronauts(id),
  CONSTRAINT fk_emergency_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS medical_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  astronaut_id BIGINT UNSIGNED NOT NULL,
  record_type VARCHAR(48) NOT NULL,
  clinical_note TEXT NOT NULL,
  recorded_by BIGINT UNSIGNED NULL,
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_medical_history_astronaut_time (astronaut_id, recorded_at),
  CONSTRAINT fk_medical_history_astronaut FOREIGN KEY (astronaut_id) REFERENCES astronauts(id) ON DELETE CASCADE,
  CONSTRAINT fk_medical_history_user FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  health_alert_id BIGINT UNSIGNED NULL,
  emergency_event_id BIGINT UNSIGNED NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_notification_user_unread (user_id, read_at, created_at),
  KEY idx_notification_event (emergency_event_id),
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_alert FOREIGN KEY (health_alert_id) REFERENCES health_alerts(id) ON DELETE SET NULL,
  CONSTRAINT fk_notification_emergency FOREIGN KEY (emergency_event_id) REFERENCES emergency_events(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS application_sessions (
  token_hash CHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  csrf_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (token_hash),
  KEY idx_session_user (user_id),
  KEY idx_session_expiry (expires_at),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS simulator_states (
  astronaut_id BIGINT UNSIGNED NOT NULL,
  mode VARCHAR(24) NOT NULL DEFAULT 'NORMAL',
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (astronaut_id),
  CONSTRAINT fk_simulator_astronaut FOREIGN KEY (astronaut_id) REFERENCES astronauts(id) ON DELETE CASCADE,
  CONSTRAINT fk_simulator_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
