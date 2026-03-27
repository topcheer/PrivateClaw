#include "my_application.h"

#include <flutter_linux/flutter_linux.h>
#ifdef GDK_WINDOWING_X11
#include <gdk/gdkx.h>
#endif
#include <glib/gstdio.h>

#include "flutter/generated_plugin_registrant.h"

struct _MyApplication {
  GtkApplication parent_instance;
  char** dart_entrypoint_arguments;
  GtkWidget* window;
  GtkWidget* tray_menu;
  GtkStatusIcon* status_icon;
  gboolean allow_shutdown;
};

G_DEFINE_TYPE(MyApplication, my_application, GTK_TYPE_APPLICATION)

static void my_application_show_main_window(MyApplication* self) {
  if (self->window == nullptr) {
    return;
  }

  gtk_widget_show_all(self->window);
  gtk_window_present(GTK_WINDOW(self->window));
}

static void my_application_hide_main_window(MyApplication* self) {
  if (self->window == nullptr) {
    return;
  }

  gtk_widget_hide(self->window);
}

static void my_application_quit(MyApplication* self) {
  self->allow_shutdown = TRUE;
  g_application_quit(G_APPLICATION(self));
}

static void my_application_window_destroyed(GtkWidget* widget,
                                            gpointer user_data) {
  static_cast<void>(widget);
  MyApplication* self = MY_APPLICATION(user_data);
  self->window = nullptr;
}

static gboolean my_application_window_delete_event(GtkWidget* widget,
                                                   GdkEvent* event,
                                                   gpointer user_data) {
  static_cast<void>(widget);
  static_cast<void>(event);
  MyApplication* self = MY_APPLICATION(user_data);
  if (self->allow_shutdown) {
    return FALSE;
  }

  my_application_hide_main_window(self);
  return TRUE;
}

#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wdeprecated-declarations"

static gchar* my_application_resolve_status_icon_path() {
  g_autofree gchar* executable_path = g_file_read_link("/proc/self/exe", nullptr);
  if (executable_path == nullptr) {
    return nullptr;
  }

  g_autofree gchar* executable_dir = g_path_get_dirname(executable_path);
  gchar* icon_path = g_build_filename(executable_dir, "data", "flutter_assets",
                                      "assets", "branding",
                                      "privateclaw_app_icon.png", nullptr);
  if (!g_file_test(icon_path, G_FILE_TEST_EXISTS)) {
    g_free(icon_path);
    return nullptr;
  }
  return icon_path;
}

static void my_application_show_tray_menu(GtkStatusIcon* status_icon,
                                          guint button,
                                          guint activate_time,
                                          gpointer user_data) {
  MyApplication* self = MY_APPLICATION(user_data);
  if (self->tray_menu == nullptr) {
    return;
  }

  gtk_menu_popup(GTK_MENU(self->tray_menu), nullptr, nullptr,
                 gtk_status_icon_position_menu, status_icon, button,
                 activate_time);
}

static void my_application_ensure_status_icon(MyApplication* self) {
  if (self->status_icon != nullptr) {
    gtk_status_icon_set_visible(self->status_icon, TRUE);
    return;
  }

  g_autofree gchar* icon_path = my_application_resolve_status_icon_path();
  if (icon_path != nullptr) {
    self->status_icon = gtk_status_icon_new_from_file(icon_path);
  } else {
    self->status_icon = gtk_status_icon_new_from_icon_name("applications-internet");
  }

  gtk_status_icon_set_title(self->status_icon, "PrivateClaw");
  gtk_status_icon_set_tooltip_text(self->status_icon, "PrivateClaw");
  gtk_status_icon_set_visible(self->status_icon, TRUE);

  self->tray_menu = gtk_menu_new();

  GtkWidget* open_item = gtk_menu_item_new_with_label("Open PrivateClaw");
  g_signal_connect_swapped(open_item, "activate",
                           G_CALLBACK(my_application_show_main_window), self);
  gtk_menu_shell_append(GTK_MENU_SHELL(self->tray_menu), open_item);

  GtkWidget* hide_item = gtk_menu_item_new_with_label("Hide PrivateClaw");
  g_signal_connect_swapped(hide_item, "activate",
                           G_CALLBACK(my_application_hide_main_window), self);
  gtk_menu_shell_append(GTK_MENU_SHELL(self->tray_menu), hide_item);

  GtkWidget* separator = gtk_separator_menu_item_new();
  gtk_menu_shell_append(GTK_MENU_SHELL(self->tray_menu), separator);

  GtkWidget* quit_item = gtk_menu_item_new_with_label("Quit PrivateClaw");
  g_signal_connect_swapped(quit_item, "activate", G_CALLBACK(my_application_quit),
                           self);
  gtk_menu_shell_append(GTK_MENU_SHELL(self->tray_menu), quit_item);

  gtk_widget_show_all(self->tray_menu);

  g_signal_connect_swapped(self->status_icon, "activate",
                           G_CALLBACK(my_application_show_main_window), self);
  g_signal_connect(self->status_icon, "popup-menu",
                   G_CALLBACK(my_application_show_tray_menu), self);
}

#pragma GCC diagnostic pop

// Called when first Flutter frame received.
static void first_frame_cb(MyApplication* self, FlView* view) {
  my_application_ensure_status_icon(self);
  gtk_widget_show(gtk_widget_get_toplevel(GTK_WIDGET(view)));
}

// Implements GApplication::activate.
static void my_application_activate(GApplication* application) {
  MyApplication* self = MY_APPLICATION(application);
  if (self->window != nullptr) {
    my_application_show_main_window(self);
    return;
  }

  GtkWindow* window =
      GTK_WINDOW(gtk_application_window_new(GTK_APPLICATION(application)));
  self->window = GTK_WIDGET(window);

  // Use a header bar when running in GNOME as this is the common style used
  // by applications and is the setup most users will be using (e.g. Ubuntu
  // desktop).
  // If running on X and not using GNOME then just use a traditional title bar
  // in case the window manager does more exotic layout, e.g. tiling.
  // If running on Wayland assume the header bar will work (may need changing
  // if future cases occur).
  gboolean use_header_bar = TRUE;
#ifdef GDK_WINDOWING_X11
  GdkScreen* screen = gtk_window_get_screen(window);
  if (GDK_IS_X11_SCREEN(screen)) {
    const gchar* wm_name = gdk_x11_screen_get_window_manager_name(screen);
    if (g_strcmp0(wm_name, "GNOME Shell") != 0) {
      use_header_bar = FALSE;
    }
  }
#endif
  if (use_header_bar) {
    GtkHeaderBar* header_bar = GTK_HEADER_BAR(gtk_header_bar_new());
    gtk_widget_show(GTK_WIDGET(header_bar));
    gtk_header_bar_set_title(header_bar, "PrivateClaw");
    gtk_header_bar_set_show_close_button(header_bar, TRUE);
    gtk_window_set_titlebar(window, GTK_WIDGET(header_bar));
  } else {
    gtk_window_set_title(window, "PrivateClaw");
  }

  gtk_window_set_default_size(window, 1280, 720);

  g_autoptr(FlDartProject) project = fl_dart_project_new();
  fl_dart_project_set_dart_entrypoint_arguments(
      project, self->dart_entrypoint_arguments);

  FlView* view = fl_view_new(project);
  GdkRGBA background_color;
  // Background defaults to black, override it here if necessary, e.g. #00000000
  // for transparent.
  gdk_rgba_parse(&background_color, "#000000");
  fl_view_set_background_color(view, &background_color);
  gtk_widget_show(GTK_WIDGET(view));
  gtk_container_add(GTK_CONTAINER(window), GTK_WIDGET(view));

  // Show the window when Flutter renders.
  // Requires the view to be realized so we can start rendering.
  g_signal_connect_swapped(view, "first-frame", G_CALLBACK(first_frame_cb),
                           self);
  gtk_widget_realize(GTK_WIDGET(view));

  fl_register_plugins(FL_PLUGIN_REGISTRY(view));

  g_signal_connect(window, "delete-event",
                   G_CALLBACK(my_application_window_delete_event), self);
  g_signal_connect(window, "destroy",
                   G_CALLBACK(my_application_window_destroyed), self);

  gtk_widget_grab_focus(GTK_WIDGET(view));
}

// Implements GApplication::local_command_line.
static gboolean my_application_local_command_line(GApplication* application,
                                                  gchar*** arguments,
                                                  int* exit_status) {
  MyApplication* self = MY_APPLICATION(application);
  // Strip out the first argument as it is the binary name.
  self->dart_entrypoint_arguments = g_strdupv(*arguments + 1);

  g_autoptr(GError) error = nullptr;
  if (!g_application_register(application, nullptr, &error)) {
    g_warning("Failed to register: %s", error->message);
    *exit_status = 1;
    return TRUE;
  }

  g_application_activate(application);
  *exit_status = 0;

  return TRUE;
}

// Implements GApplication::startup.
static void my_application_startup(GApplication* application) {
  // MyApplication* self = MY_APPLICATION(object);

  // Perform any actions required at application startup.

  G_APPLICATION_CLASS(my_application_parent_class)->startup(application);
}

// Implements GApplication::shutdown.
static void my_application_shutdown(GApplication* application) {
  MyApplication* self = MY_APPLICATION(application);

  self->allow_shutdown = TRUE;
  if (self->status_icon != nullptr) {
    gtk_status_icon_set_visible(self->status_icon, FALSE);
    g_clear_object(&self->status_icon);
  }
  if (self->tray_menu != nullptr) {
    gtk_widget_destroy(self->tray_menu);
    self->tray_menu = nullptr;
  }
  self->window = nullptr;

  G_APPLICATION_CLASS(my_application_parent_class)->shutdown(application);
}

// Implements GObject::dispose.
static void my_application_dispose(GObject* object) {
  MyApplication* self = MY_APPLICATION(object);
  g_clear_pointer(&self->dart_entrypoint_arguments, g_strfreev);
  g_clear_object(&self->status_icon);
  if (self->tray_menu != nullptr) {
    gtk_widget_destroy(self->tray_menu);
    self->tray_menu = nullptr;
  }
  self->window = nullptr;
  G_OBJECT_CLASS(my_application_parent_class)->dispose(object);
}

static void my_application_class_init(MyApplicationClass* klass) {
  G_APPLICATION_CLASS(klass)->activate = my_application_activate;
  G_APPLICATION_CLASS(klass)->local_command_line =
      my_application_local_command_line;
  G_APPLICATION_CLASS(klass)->startup = my_application_startup;
  G_APPLICATION_CLASS(klass)->shutdown = my_application_shutdown;
  G_OBJECT_CLASS(klass)->dispose = my_application_dispose;
}

static void my_application_init(MyApplication* self) {
  self->window = nullptr;
  self->tray_menu = nullptr;
  self->status_icon = nullptr;
  self->allow_shutdown = FALSE;
}

MyApplication* my_application_new() {
  // Set the program name to the application ID, which helps various systems
  // like GTK and desktop environments map this running application to its
  // corresponding .desktop file. This ensures better integration by allowing
  // the application to be recognized beyond its binary name.
  g_set_prgname(APPLICATION_ID);

  return MY_APPLICATION(g_object_new(my_application_get_type(),
                                     "application-id", APPLICATION_ID, "flags",
                                     G_APPLICATION_NON_UNIQUE, nullptr));
}
