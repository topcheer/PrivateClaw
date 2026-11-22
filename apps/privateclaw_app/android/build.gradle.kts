allprojects {
    repositories {
        google()
        // JetBrains' official Maven Central mirror; shields CI builds from
        // intermittent repo.maven.apache.org 429 rate limits.
        maven("https://cache-redirector.jetbrains.com/maven-central")
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
