use crate::core::commands::cost_estimate::estimate_audio_cost_command::estimate_audio_cost_command;
use crate::core::commands::cost_estimate::estimate_mesh_cost_command::estimate_mesh_cost_command;
use crate::core::commands::generate::generate_splat_command::generate_splat_command;
use crate::core::commands::generate::generate_audio_command::generate_audio_command;
use crate::core::commands::generate::generate_mesh_command::generate_mesh_command;
pub mod core;
pub mod services;
pub mod version;

use tauri::Manager;

use crate::core::commands::app_preferences::get_app_preferences_command::get_app_preferences_command;
use crate::core::commands::app_preferences::update_app_preference_command::update_app_preferences_command;
use crate::core::commands::cost_estimate::estimate_image_cost_command::estimate_image_cost_command;
use crate::core::commands::cost_estimate::estimate_splat_cost_command::estimate_splat_cost_command;
use crate::core::commands::cost_estimate::estimate_video_cost_command::estimate_video_cost_command;
use crate::core::commands::generate::models::image::list_image_models_command::list_image_models_command;
use crate::core::commands::generate::models::video::list_video_models_command::list_video_models_command;
use crate::core::commands::download::download_directory_reveal_command::download_directory_reveal_command;
use crate::core::commands::download::download_media_file_command::download_media_file_command;
use crate::core::commands::download::download_url_command::download_url_command;
use crate::core::commands::download::get_download_path_command::get_download_path_command;
use crate::core::commands::enqueue::image_bg_removal::enqueue_image_bg_removal_command::enqueue_image_bg_removal_command;
use crate::core::commands::enqueue::image_to_gaussian::enqueue_image_to_gaussian_command::enqueue_image_to_gaussian_command;
use crate::core::commands::enqueue::image_to_object::enqueue_image_to_3d_object_command::enqueue_image_to_3d_object_command;
use crate::core::commands::generate::generate_image::generate_image_command::generate_image_command;
use crate::core::commands::generate::generate_video::generate_video_command::generate_video_command;
use crate::core::commands::flip_image::flip_image;
use crate::core::commands::get_app_info_command::get_app_info_command;
use crate::core::commands::load_without_cors_command::load_without_cors_command;
use crate::core::commands::media_files::list_local_media_command::list_local_media_command;
use crate::core::commands::media_files::media_file_delete_command::media_file_delete_command;
use crate::core::commands::platform_info_command::platform_info_command;
use crate::core::commands::providers::deprecated::get_provider_order_command::get_provider_order_command;
use crate::core::commands::providers::deprecated::set_provider_order_command::set_provider_order_command;
use crate::core::commands::providers::provider_clear_command::provider_clear_command;
use crate::core::commands::providers::provider_list_command::provider_list_command;
use crate::core::commands::providers::provider_set_api_key_command::provider_set_api_key_command;
use crate::core::commands::task_queue::get_task_queue_command::get_task_queue_command;
use crate::core::commands::task_queue::mark_task_as_dismissed_command::mark_task_as_dismissed_command;
use crate::core::commands::task_queue::tasks_nuke_all_command::tasks_nuke_all_command;
use crate::core::lifecycle::startup::handle_tauri_startup::handle_tauri_startup;
use crate::core::lifecycle::startup::setup_main_window::setup_main_window;
use crate::core::state::app_env_configs::app_env_configs::AppEnvConfigs;
use crate::core::state::app_preferences::app_preferences_manager::load_app_preferences_or_default;
use crate::core::state::artcraft_platform_info::ArtcraftPlatformInfo;
use crate::core::state::data_dir::app_data_root::AppDataRoot;
use crate::core::state::provider_priority::ProviderPriorityStore;
use crate::core::threads::discord_presence_thread::discord_presence_thread;
use crate::core::threads::main_window_thread::main_window_thread::main_window_thread;
use crate::services::storyteller::commands::login_bridge::DesktopLoginBridgeState;
use crate::services::storyteller::commands::storyteller_cancel_login_challenge_command::storyteller_cancel_login_challenge_command;
use crate::services::storyteller::commands::storyteller_create_login_challenge_command::storyteller_create_login_challenge_command;
use crate::services::storyteller::commands::storyteller_get_login_session_command::storyteller_get_login_session_command;
use crate::services::storyteller::commands::storyteller_password_login_command::storyteller_password_login_command;
use crate::services::storyteller::commands::storyteller_password_signup_command::storyteller_password_signup_command;
use crate::services::storyteller::commands::storyteller_poll_login_challenge_command::storyteller_poll_login_challenge_command;
use crate::services::storyteller::commands::storyteller_get_credits_command::storyteller_get_credits_command;
use crate::services::storyteller::commands::storyteller_get_subscription_command::storyteller_get_subscription_command;
use crate::services::storyteller::commands::storyteller_purge_credentials_command::storyteller_purge_credentials_command;
use crate::services::storyteller::commands::stripe_checkout::storyteller_open_credits_purchase_command::storyteller_open_credits_purchase_command;
use crate::services::storyteller::commands::stripe_checkout::storyteller_open_subscription_purchase_command::storyteller_open_subscription_purchase_command;
use crate::services::storyteller::commands::stripe_customer_portal::storyteller_open_customer_portal_cancel_plan_command::storyteller_open_customer_portal_cancel_plan_command;
use crate::services::storyteller::commands::stripe_customer_portal::storyteller_open_customer_portal_manage_plan_command::storyteller_open_customer_portal_manage_plan_command;
use crate::services::storyteller::commands::stripe_customer_portal::storyteller_open_customer_portal_switch_plan_command::storyteller_open_customer_portal_switch_plan_command;
use crate::services::storyteller::commands::stripe_customer_portal::storyteller_open_customer_portal_update_payment_method_command::storyteller_open_customer_portal_update_payment_method_command;
use crate::services::storyteller::state::storyteller_credential_manager::StorytellerCredentialManager;
use log::error;

use crate::core::state::artcraft_usage_tracker::artcraft_usage_tracker::ArtcraftUsageTracker;
use tauri_plugin_dialog;
use tauri_plugin_http;
use tauri_plugin_log::Target;
use tauri_plugin_log::TargetKind;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // NB: Tauri wants to install the logger itself, so we can't rely on the logger crate
  // until the tauri runtime begins.
  println!("Loading config...");
  let app_data_root = AppDataRoot::create_default().expect("data directory should be created");
  let app_data_root_2 = app_data_root.clone();

  println!("Getting platform info...");
  let artcraft_platform_info = ArtcraftPlatformInfo::get();
  let artcraft_platform_info_2 = artcraft_platform_info.clone();

  println!("Platform info: {:?}", artcraft_platform_info);

  println!("Loading app preferences...");
  let app_preferences = load_app_preferences_or_default(&app_data_root);
  
  let provider_credential_cache = crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache::new(app_data_root.clone());
  let provider_credential_cache_2 = provider_credential_cache.clone();

  // NB: tauri-plugin-http stores the credentials on disk, so we can defer to that for now.
  // println!("Attempting to read existing artcraft credentials...");
  // let storyteller_creds_manager = StorytellerCredentialManager::initialize_from_disk_infallible(&app_data_root);
  let storyteller_creds_manager = StorytellerCredentialManager::initialize_empty(&app_data_root);
  let storyteller_creds_manager_2 = storyteller_creds_manager.clone();
  let storyteller_creds_manager_3 = storyteller_creds_manager.clone();
  
  

  let app_env_configs = AppEnvConfigs::load_from_filesystem(&app_data_root)
    .expect("AppEnvConfigs should be loaded from disk");
  
  let app_env_configs_2 = app_env_configs.clone();





  
  let artcraft_usage_tracker = ArtcraftUsageTracker::new();
  let artcraft_usage_tracker_2 = artcraft_usage_tracker.clone();

  println!("Initializing backend runtime...");

  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_upload::init())
    .setup(move |app| {
      // TODO(bt): This is broken on windows
      // log_environment_details();

      //if cfg!(debug_assertions) {
      //  app.handle().plugin(
      //    tauri_plugin_log::Builder::default()
      //      .level(log::LevelFilter::Info)
      //      .build(),
      //  )?;
      //}
      let app = app.handle().clone();
      let handle = app.clone();
      let root = app_data_root_2.clone();
      let env_config = app_env_configs_2.clone();
      let storyteller_creds = storyteller_creds_manager_2.clone();

      tauri::async_runtime::block_on(async move {
        let result = setup_main_window(&app).await;

        let result = handle_tauri_startup(
          handle,
          root,
          env_config,
          artcraft_platform_info_2,
          artcraft_usage_tracker_2,
          storyteller_creds,
          provider_credential_cache_2,
        ).await;

        if let Err(err) = result {
          error!("Failed to handle Tauri startup: {:?}", err);
          panic!("Failed to handle Tauri startup: {:?}", err);
        }
      });

      Ok(())
    })
    .manage(app_data_root)
    .manage(app_env_configs)
    .manage(DesktopLoginBridgeState::default())
    .manage(app_preferences)
    .manage(artcraft_platform_info)
    .manage(artcraft_usage_tracker)
    .manage(storyteller_creds_manager_3)
    .manage(provider_credential_cache);

  // TODO: Break this out into another module, because RustRover/IntelliJ lags with these macros.
  //  My first attempt at naively doing this didn't work because the macros can't find their codegen'd targets.
  let builder = builder.invoke_handler(tauri::generate_handler![
    download_directory_reveal_command,
    download_media_file_command,
    download_url_command,
    get_download_path_command,
    enqueue_image_bg_removal_command,
    enqueue_image_to_3d_object_command,
    enqueue_image_to_gaussian_command,
    estimate_image_cost_command,
    estimate_splat_cost_command,
    estimate_video_cost_command,
    estimate_audio_cost_command,
    estimate_mesh_cost_command,
    list_image_models_command,
    list_video_models_command,
    flip_image,
    generate_image_command,
    generate_video_command,
    generate_splat_command,
    generate_audio_command,
    generate_mesh_command,
    get_app_info_command,
    get_app_preferences_command,
    get_provider_order_command,
    get_task_queue_command,
    provider_clear_command,
    provider_list_command,
    provider_set_api_key_command,
    load_without_cors_command,
    mark_task_as_dismissed_command,
    list_local_media_command,
    media_file_delete_command,
    platform_info_command,
    set_provider_order_command,
    storyteller_get_login_session_command,
    storyteller_password_login_command,
    storyteller_password_signup_command,
    storyteller_create_login_challenge_command,
    storyteller_poll_login_challenge_command,
    storyteller_cancel_login_challenge_command,
    storyteller_get_credits_command,
    storyteller_get_subscription_command,
    storyteller_open_credits_purchase_command,
    storyteller_open_customer_portal_cancel_plan_command,
    storyteller_open_customer_portal_manage_plan_command,
    storyteller_open_customer_portal_switch_plan_command,
    storyteller_open_customer_portal_update_payment_method_command,
    storyteller_open_subscription_purchase_command,
    storyteller_purge_credentials_command,
    tasks_nuke_all_command,
    update_app_preferences_command,
  ]);

  builder.run(tauri::generate_context!("tauri.conf.json"))
    .expect("error while running tauri application");
}
