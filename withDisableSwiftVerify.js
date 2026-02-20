const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withDisableSwiftVerify = (config) => {
    return withDangerousMod(config, [
        'ios',
        async (config) => {
            const file = path.join(config.modRequest.platformProjectRoot, 'Podfile');
            let contents = fs.readFileSync(file, 'utf-8');

            const postInstallRegex = /post_install do \|installer\|/;

            const snippet = `
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'NO'
    end
  end
`;
            if (contents.includes("BUILD_LIBRARY_FOR_DISTRIBUTION")) {
                return config;
            }

            if (postInstallRegex.test(contents)) {
                contents = contents.replace(
                    postInstallRegex,
                    `post_install do |installer|\n${snippet}`
                );
            } else {
                contents += `\npost_install do |installer|\n${snippet}end\n`;
            }

            fs.writeFileSync(file, contents);
            return config;
        },
    ]);
};

module.exports = withDisableSwiftVerify;
